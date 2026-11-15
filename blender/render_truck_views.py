"""
15 ракурсов машины целиком (горизонтальный кадр 1920×1080), сцена не сохраняется.
Запуск: blender --background blender/kshm2_scene.blend --python blender/render_truck_views.py -- [сэмплы]
Предметы окружения, которые заслоняют машину в конкретном ракурсе, на этот кадр скрываются.
"""
import bpy, os, sys, math
from mathutils import Vector
from mathutils.geometry import intersect_point_line

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sc = bpy.context.scene
sc.cycles.samples = int(argv[0]) if argv else 96
r = sc.render
r.resolution_x, r.resolution_y, r.resolution_percentage = 1920, 1080, 100
r.use_motion_blur = False
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
sc.timeline_markers.clear()
out = os.path.join(HERE, 'renders', 'truck_views')
os.makedirs(out, exist_ok=True)

env = bpy.data.collections.get('Окружение_город')
occluders = [o for o in env.all_objects if not o.name.startswith(('Дом', 'Парапет', 'Тротуар', 'Бордюр'))] if env else []

cd = bpy.data.cameras.new('VIEW'); cd.lens = 35; cd.sensor_width = 36; cd.clip_end = 1000
cd.dof.use_dof = True; cd.dof.aperture_fstop = 8.0
cam = bpy.data.objects.new('VIEW', cd); sc.collection.objects.link(cam); sc.camera = cam

C = Vector((0.0, 0.0, 1.8))          # центр машины
views = []
for i, az in enumerate(range(0, 360, 45)):                       # 8 — на уровне глаз
    views.append((f'{len(views) + 1:02d}_уровень_глаз_{az}°', 200, az, 17.5, 1.7, C))
for az in (30, 120, 210, 300):                                    # 4 — с высоты
    views.append((f'{len(views) + 1:02d}_с_высоты_{az}°', 200, az, 18.0, 8.5, C))
for az in (25, 205):                                              # 2 — низкий ракурс
    views.append((f'{len(views) + 1:02d}_низкий_{az}°', 200, az, 16.0, 0.45, Vector((0, 0, 2.2))))
views.append((f'{len(views) + 1:02d}_мачты_подняты', 690, 40, 24.0, 6.0, Vector((0, 0, 5.5))))

for name, frame, az, R, h, tgt in views:
    sc.frame_set(frame)
    a = math.radians(az)
    pos = Vector((tgt.x + R * math.cos(a), tgt.y + R * math.sin(a), h))
    cam.location = pos
    cam.rotation_euler = (tgt - pos).to_track_quat('-Z', 'Y').to_euler()
    cd.dof.focus_distance = (tgt - pos).length
    hidden = []
    for o in occluders:
        p = Vector((o.matrix_world.translation.x, o.matrix_world.translation.y, 0))
        a2, b2 = Vector((pos.x, pos.y, 0)), Vector((tgt.x, tgt.y, 0))
        q, t = intersect_point_line(p, a2, b2)
        if 0.0 < t < 1.0 and (q - p).length < 4.0 and not o.hide_render:
            o.hide_render = True; hidden.append(o)
    r.filepath = os.path.join(out, name + '.png')
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    print('RENDERED', name, 'hidden:', len(hidden))
