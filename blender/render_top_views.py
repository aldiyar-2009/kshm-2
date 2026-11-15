"""
Виды сверху (сцена не сохраняется — камеры временные).
Запуск: blender --background blender/kshm2_scene.blend --python blender/render_top_views.py -- [сэмплы]
"""
import bpy, os, sys, math
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sc = bpy.context.scene
sc.cycles.samples = int(argv[0]) if argv else 96
sc.render.resolution_percentage = 100
sc.render.use_motion_blur = False
prefs = bpy.context.preferences.addons['cycles'].preferences
for dev in ('OPTIX', 'CUDA'):
    try:
        prefs.compute_device_type = dev; prefs.get_devices()
        if any(d.type == dev for d in prefs.devices):
            for d in prefs.devices:
                d.use = d.type == dev
            sc.cycles.device = 'GPU'; break
    except Exception:
        continue
sc.timeline_markers.clear()          # маркеры переключают камеры — для стоп-кадров не нужны
out = os.path.join(HERE, 'renders', 'stills')
os.makedirs(out, exist_ok=True)


def cam(name, loc, look, lens=None, ortho=None, roll=0.0):
    cd = bpy.data.cameras.new(name); cd.clip_end = 1000
    if ortho:
        cd.type = 'ORTHO'; cd.ortho_scale = ortho
    else:
        cd.lens = lens
    c = bpy.data.objects.new(name, cd); sc.collection.objects.link(c)
    c.location = loc
    d = Vector(look) - Vector(loc)
    q = d.to_track_quat('-Z', 'Y')
    c.rotation_euler = q.to_euler()
    c.rotation_euler.rotate_axis('Z', roll)
    return c


shots = [
    # (файл, кадр, камера)
    ('7_сверху_строго.png', 200, cam('TOP_ortho', (0.2, 0, 60), (0.2, 0, 0), ortho=15.5, roll=math.radians(90))),
    ('8_сверху_двор.png', 200, cam('TOP_yard', (-26, -30, 46), (1, 2, 0), lens=24)),
    ('9_сверху_разборка.png', 400, cam('TOP_exploded', (0.2, 0, 60), (0.2, 0, 0), ortho=19, roll=math.radians(90))),
    ('10_сверху_мачты.png', 690, cam('TOP_masts', (16, -18, 26), (0, 0, 5), lens=24)),
]
for fn, f, c in shots:
    sc.frame_set(f)
    sc.camera = c
    sc.render.filepath = os.path.join(out, fn)
    bpy.ops.render.render(write_still=True)
    print('RENDERED', sc.render.filepath)
