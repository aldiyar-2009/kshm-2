"""
Финальный рендер ролика: PNG-кадры 1080×1920 → blender/renders/frames/, затем сборка MP4.
Запуск: blender --background blender/kshm2_scene.blend --python blender/render_video.py -- [сэмплы] [проценты] [имя]
Черновик: ... -- 16 50 preview  → renders/preview_frames/ и renders/KSHM2_preview.mp4
Уже отрендеренные кадры пропускаются — рендер можно прерывать и продолжать.
"""
import bpy, os, sys, glob

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
sc = bpy.context.scene
if argv:
    sc.cycles.samples = int(argv[0])
if len(argv) > 1:
    sc.render.resolution_percentage = int(argv[1])
NAME = argv[2] if len(argv) > 2 else ''
if NAME:
    sc.render.use_motion_blur = False

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

frames_dir = os.path.join(HERE, 'renders', (NAME + '_frames') if NAME else 'frames')
os.makedirs(frames_dir, exist_ok=True)
sc.render.image_settings.file_format = 'PNG'
sc.render.filepath = os.path.join(frames_dir, 'kshm2_')
sc.render.use_overwrite = False      # продолжение после остановки
sc.render.use_placeholder = True
bpy.ops.render.render(animation=True)

# ---- сборка MP4 (H.264) через видеоредактор Blender
files = sorted(glob.glob(os.path.join(frames_dir, 'kshm2_*.png')))
if files:
    vs = bpy.data.scenes.new('MP4')
    vs.render.resolution_x = sc.render.resolution_x * sc.render.resolution_percentage // 100
    vs.render.resolution_y = sc.render.resolution_y * sc.render.resolution_percentage // 100
    vs.render.resolution_percentage = 100
    vs.render.fps = sc.render.fps
    vs.frame_start, vs.frame_end = 1, len(files)
    vs.sequence_editor_create()
    se = vs.sequence_editor
    strips = se.strips if hasattr(se, 'strips') else se.sequences
    st = strips.new_image('frames', files[0], channel=1, frame_start=1)
    for f in files[1:]:
        st.elements.append(os.path.basename(f))
    if hasattr(vs.render.image_settings, 'media_type'):
        vs.render.image_settings.media_type = 'VIDEO'   # Blender 5.x
    vs.render.image_settings.file_format = 'FFMPEG'
    vs.render.ffmpeg.format = 'MPEG4'
    vs.render.ffmpeg.codec = 'H264'
    vs.render.ffmpeg.constant_rate_factor = 'HIGH'
    vs.render.ffmpeg.ffmpeg_preset = 'GOOD'
    vs.render.filepath = os.path.join(HERE, 'renders', 'KSHM2_preview.mp4' if NAME else 'KSHM2_reels.mp4')
    vs.view_settings.view_transform = 'Standard'
    bpy.ops.render.render(animation=True, scene=vs.name)
    print('VIDEO', vs.render.filepath)
