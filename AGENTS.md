# AGENTS.md

## Project summary and core loop
ヘアピン前でブレーキを踏み、ハンドルとサイドブレーキで向きを変えてドリフトし、立ち上がりで加速します。ガードレールにぶつかると減速するので、きれいなラインでタイムを縮めてライバルに勝つのが目的です。

## How to play / controls
STARTを押してカウントダウン後に発進し、夜の峠を約1.5km下ります。黄色いライバル車より先にGOALゲートを通過すれば勝ちです。
Controls: W/↑ アクセル、S/↓ ブレーキ・バック、A/D・←/→ ハンドル、Space サイドブレーキ（ドリフト）、C カメラ切替（追従/車内視点）、R リスタート、M ミュート

## Important files
- `/index.html` — entry point: importmap, canvas/DOM shell, script bootstrap
- `/rosebud-game-defaults.css` — project file
- `/rosebud-game-defaults.js` — game module
- `/rosie/README.md` — Rosie pre-built helper module
- `/rosie/roseblox.js` — Rosie pre-built helper module
- `/instant_db_config.js` — InstantDB multiplayer configuration
- `/instant_db.md` — project notes
- `/art_direction.md` — visual direction used for generated art
- `/sound_direction.md` — audio direction used for generated sound
- `/track.js` — game module
- `/car.js` — game module
- `/main.js` — game bootstrap and main loop

## Assets and audio
Images: `assets/asphalt-road.webp`, `assets/forest-grass.webp`, `assets/night-mountain.webp`
Models: `assets/models/player-car.glb`, `assets/models/rival-car.glb`
Audio: `assets/audio/eurobeat-bgm.mp3`, `assets/audio/tire-squeal.mp3`
Sound direction: - BGM: high-energy 90s eurobeat-style synth loop. - SFX: tire squeal loop (drift), procedural engine (WebAudio saw by RPM), procedural wall bump.
Playback note: reference media as `assets/...`; browsers start audio only after the first user gesture.

## Notes for future edits
track.js: コースは CatmullRom 曲線の制御点（CONTROL）を 2400 点にサンプリングして作り、道幅は ROAD_WIDTH=11m。track.project で最寄りのサンプル点と横方向のずれを求め、ガードレールの当たり判定にしています。speedLimit はカーブの曲率から計算した AI 用の目標速度です。car.js: 自前の運転物理（vF=前後速度、vS=横滑り、グリップ減衰）を使い、roseblox は使っていません。モデルの前方は +Z で、heading=atan2(fx,fz)。RivalCar はスプラインに沿って走ります。main.js: 状態は menu/countdown/race/finished。InstantDB のプレゼンスはルーム 'touge' で、?room= のURLから参加します。ベストタイムは localStorage に保存されます。

## Final validation status
Static: 0 blocking, 24 advisory; overall clean. Runtime behavior was not checked during generation.
Finished via the `finish` tool.
