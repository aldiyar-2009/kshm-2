"""
Тестовые кадры с каждой камеры (уменьшенное разрешение) — для проверки света.
Запуск: blender --background blender/kshm2_scene.blend --python blender/render_tests.py -- [проценты] [сэмплы] [кадры...]
"""
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
pct = int(argv[0]) if len(argv) > 0 else 50
spp = int(argv[1]) if len(argv) > 1 else 64
frames = [int(x) for x in argv[2:]] or [40, 165, 300, 380]

sc = bpy.context.scene
# видеокарта (настройки устройства хранятся в настройках Blender, а не в .blend)
prefs = bpy.context.preferences.addons['cycles'].preferences
for dev in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = dev
        prefs.get_devices()
        if any(d.type == dev for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == dev
            sc.cycles.device = 'GPU'
            print('DEVICE', dev)
            break
    except Exception:
        continue
sc.render.resolution_percentage = pct
sc.cycles.samples = spp
sc.render.use_motion_blur = False
os.makedirs(os.path.join(HERE, 'renders'), exist_ok=True)
markers = sorted(sc.timeline_markers, key=lambda m: m.frame)
for f in frames:
    sc.frame_set(f)
    cam = [m for m in markers if m.frame <= f][-1].camera
    sc.camera = cam
    sc.render.filepath = os.path.join(HERE, 'renders', f'test_{f:03d}_{cam.name}.png')
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
