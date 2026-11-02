import * as THREE from 'three';
import { ROAD_WIDTH } from './track.js';

const GEAR_RATIOS = [3.3, 2.1, 1.5, 1.15, 0.92];
const GEAR_TOP = [14, 24, 34, 45, 60]; // m/s at redline per gear

export function prepareModel(scene3d, length, fallbackColor) {
    const holder = new THREE.Group();
    if (scene3d) {
        const box = new THREE.Box3().setFromObject(scene3d);
        const size = box.getSize(new THREE.Vector3());
        const s = length / Math.max(size.z, size.x);
        scene3d.scale.setScalar(s);
        const box2 = new THREE.Box3().setFromObject(scene3d);
        const c = box2.getCenter(new THREE.Vector3());
        scene3d.position.set(-c.x, -box2.min.y, -c.z);
        holder.add(scene3d);
    } else {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.2, length), new THREE.MeshStandardMaterial({ color: fallbackColor }));
        body.position.y = 0.6;
        holder.add(body);
    }
    return holder;
}

export class Car {
    constructor(visual, track, perf = { acc: 1, top: 60, grip: 1, brake: 1 }) {
        this.track = track;
        this.perf = perf;
        this.gearTop = GEAR_TOP.map(v => v * (perf.top / 60));
        this.drag = 0.0012 * (60 / perf.top) ** 2 * Math.max(1, perf.acc * 0.9);
        this.group = new THREE.Group();
        this.group.add(visual);
        const p = track.pts[track.startIndex - 20];
        const t = track.tangents[track.startIndex - 20];
        this.x = p.x;
        this.z = p.z;
        this.y = p.y;
        this.heading = Math.atan2(t.x, t.z);
        this.vF = 0;
        this.vS = 0;
        this.yawRate = 0;
        this.index = track.startIndex - 20;
        this.lateral = 0;
        this.gear = 1;
        this.rpm = 900;
        this.slip = 0;
        this.hitWall = 0;
        this.steer = 0;
    }

    placeAtLane(offset) {
        const s = this.track.sides[this.index];
        this.x += s.x * offset;
        this.z += s.z * offset;
        this.sync();
    }

    update(dt, input) {
        const targetSteer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
        this.steer += (targetSteer - this.steer) * Math.min(1, dt * 6);

        const speed = Math.abs(this.vF);
        // Engine force from gear
        const gi = this.gear - 1;
        const torque = (GEAR_RATIOS[gi] * 2.9 * this.perf.acc) * (this.rpm > 8200 ? 0.2 : 1);
        let acc = 0;
        if (input.throttle) {
            acc += torque;
        }
        if (input.brake) {
            acc -= this.vF > 0.5 ? 16 * this.perf.brake : 4;
        }
        acc -= this.drag * this.vF * this.vF + 0.25 * Math.sign(this.vF);
        if (input.handbrake) {
            acc -= 3 * Math.sign(this.vF);
        }
        this.vF += acc * dt;
        if (!input.throttle && !input.brake && Math.abs(this.vF) < 0.3) {
            this.vF = 0;
        }
        this.vF = Math.max(-8, this.vF);

        // Steering & drift
        const highSpeed = THREE.MathUtils.clamp(speed / 50, 0, 1);
        const steerGain = 1.9 * (1 - 0.45 * highSpeed);
        const lowSpeedFactor = THREE.MathUtils.clamp(speed / 8, 0, 1);
        const drifting = input.handbrake || (Math.abs(this.steer) > 0.8 && input.brake && speed > 20);
        let targetYaw = -this.steer * steerGain * lowSpeedFactor * Math.sign(this.vF || 1);
        if (drifting || Math.abs(this.vS) > 3) {
            targetYaw *= 1.45;
        }
        this.yawRate += (targetYaw - this.yawRate) * Math.min(1, dt * 5);
        this.heading += this.yawRate * dt;

        // Velocity in world, then rotate frame (inertia makes sideways slip)
        const fx = Math.sin(this.heading);
        const fz = Math.cos(this.heading);
        const rx = -fz;
        const rz = fx;
        let vx = this.vxw ?? fx * this.vF;
        let vz = this.vzw ?? fz * this.vF;
        // apply longitudinal change along current forward
        const curF = vx * fx + vz * fz;
        const curS = vx * rx + vz * rz;
        const grip = (drifting ? 1.3 : 6.5 - highSpeed * 2) * this.perf.grip;
        const newS = curS * Math.exp(-grip * dt);
        const newF = this.vF + (curF - this.vF) * 0.0;
        vx = fx * newF + rx * newS;
        vz = fz * newF + rz * newS;
        // speed lost in slides
        this.vF -= Math.abs(newS) * 0.15 * dt;
        this.vS = newS;
        this.vxw = vx;
        this.vzw = vz;
        this.slip = Math.abs(newS);
        this.x += vx * dt;
        this.z += vz * dt;

        this.constrain();
        this.updateGearbox(input);
        this.sync();
    }

    constrain() {
        const proj = this.track.project(this.x, this.z, this.index);
        this.index = proj.index;
        this.lateral = proj.lateral;
        const limit = ROAD_WIDTH / 2 - 0.95;
        this.hitWall = 0;
        if (Math.abs(proj.lateral) > limit) {
            const s = this.track.sides[proj.index];
            const over = proj.lateral - Math.sign(proj.lateral) * limit;
            this.x -= s.x * over;
            this.z -= s.z * over;
            const into = (this.vxw * s.x + this.vzw * s.z) * Math.sign(proj.lateral);
            if (into > 0) {
                this.vxw -= s.x * Math.sign(proj.lateral) * into * 1.4;
                this.vzw -= s.z * Math.sign(proj.lateral) * into * 1.4;
                this.hitWall = into;
                this.vF *= 1 - Math.min(0.35, into * 0.03);
            }
            // align a bit with the rail
            const t = this.track.tangents[proj.index];
            const railHeading = Math.atan2(t.x, t.z);
            let d = railHeading - this.heading;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            this.heading += d * 0.08;
        }
        const i = proj.index;
        const a = this.track.pts[i];
        const b = this.track.pts[Math.min(i + 1, this.track.N - 1)];
        this.y = a.y + (b.y - a.y) * 0.5;
        this.pitch = Math.atan2(b.y - a.y, this.track.ds);
    }

    updateGearbox() {
        const sp = Math.abs(this.vF);
        const GT = this.gearTop;
        if (this.gear < 5 && sp > GT[this.gear - 1] * 0.97) {
            this.gear++;
        } else if (this.gear > 1 && sp < GT[this.gear - 2] * 0.72) {
            this.gear--;
        }
        const target = 900 + Math.min(1.05, sp / GT[this.gear - 1]) * 7600;
        this.rpm += (target - this.rpm) * 0.25;
    }

    sync() {
        this.group.position.set(this.x, this.y, this.z);
        this.group.rotation.set(0, 0, 0);
        this.group.rotateY(this.heading);
        this.group.rotateX(-(this.pitch || 0));
        this.group.rotateZ(THREE.MathUtils.clamp(this.yawRate * this.vF * 0.004, -0.06, 0.06));
    }

    get speedKmh() {
        return Math.abs(this.vF) * 3.6;
    }
}

export class RivalCar {
    constructor(visual, track, lane, level = 0.93, gripMul = 1, startS = null) {
        this.track = track;
        this.level = level;
        this.gripMul = gripMul;
        this.group = new THREE.Group();
        this.group.add(visual);
        this.s = startS ?? (track.startIndex - 12) * track.ds;
        this.speed = 0;
        this.lane = lane;
        this.index = Math.floor(this.s / track.ds);
        this.finished = false;
        this.finishTime = null;
        this.update(0, false);
    }

    update(dt, go) {
        const tr = this.track;
        if (go && !this.finished) {
            let limit = 75;
            for (let j = 0; j < 70; j += 3) {
                const k = Math.min(tr.N - 1, this.index + j);
                const allowed = Math.sqrt(tr.speedLimit[k] ** 2 * this.gripMul + 2 * 11 * j * tr.ds);
                limit = Math.min(limit, allowed);
            }
            limit *= this.level;
            if (this.speed < limit) {
                this.speed = Math.min(limit, this.speed + 7.5 * this.level * dt);
            } else {
                this.speed = Math.max(limit, this.speed - 14 * dt);
            }
            this.s += this.speed * dt;
        }
        this.index = Math.min(tr.N - 2, Math.floor(this.s / tr.ds));
        const f = this.s / tr.ds - this.index;
        const a = tr.pts[this.index];
        const b = tr.pts[this.index + 1];
        const side = tr.sides[this.index];
        const p = a.clone().lerp(b, f).addScaledVector(side, this.lane);
        this.group.position.copy(p);
        const t = tr.tangents[this.index];
        this.group.rotation.set(0, Math.atan2(t.x, t.z), 0);
    }
}
