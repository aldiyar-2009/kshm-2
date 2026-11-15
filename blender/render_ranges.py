"""
Рендер выбранных кусков анимации (для рилса 3). Готовые кадры пропускаются.
Запуск: blender --background blender/kshm2_scene.blend --python blender/render_ranges.py -- 64 1-240 320-445 575-690
"""
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
spp = int(argv[0]) if argv else 64
ranges = [tuple(int(x) for x in a.split('-')) for a in argv[1:]] or [(1, 240), (320, 445), (575, 690)]
sc = bpy.context.scene
sc.cycles.samples = spp
sc.cycles.adaptive_threshold = 0.03
prefs = bpy.context.preferences.addons['cycles'].preferences
for dev in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = dev; prefs.get_devices()
        if any(d.type == dev for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == dev
            sc.cycles.device = 'GPU'; print('DEVICE', dev); break
    except Exception:
        continue
out = os.path.join(HERE, 'renders', 'reel3_frames')
os.makedirs(out, exist_ok=True)
sc.render.image_settings.file_format = 'PNG'
markers = sorted(sc.timeline_markers, key=lambda m: m.frame)
done = 0
for a, b in ranges:
    for f in range(a, b + 1):
        path = os.path.join(out, f'f_{f:04d}.png')
        if os.path.exists(path):
            continue
        sc.frame_set(f)
        sc.camera = [m for m in markers if m.frame <= f][-1].camera
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        done += 1
        if done % 20 == 0:
            print('PROGRESS', f, flush=True)
print('ALL DONE', done)
