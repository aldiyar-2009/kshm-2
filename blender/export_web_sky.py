"""
Готовит небо для веб-версии из той же HDRI, что освещает сцену в Blender:
  assets/sky.jpg      — фон 4096×2048 (пасмурные сумерки, как на рендере)
  assets/sky_env.hdr  — карта освещения 1024×512 (отражения на лаке, стёклах и мокром асфальте)
Запуск: blender --background --python blender/export_web_sky.py
"""
import bpy, os, math
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(HERE, 'sky_overcast_4k.hdr')
SUN_U = 0.5 + 38.0 / 360.0          # куда поставить самое яркое место неба (азимут 38° от +X к +Z)
TINT = np.array([0.80, 0.92, 1.10], dtype=np.float32)   # холодный вечерний оттенок


def load(w, h):
    img = bpy.data.images.load(SRC)
    img.scale(w, h)
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    bpy.data.images.remove(img)
    return a.reshape(h, w, 4)


def grade(a, exposure, contrast):
    rgb = a[..., :3]
    lum = (rgb * np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)).sum(-1, keepdims=True)
    rgb = lum + (rgb - lum) * 0.55                 # приглушаем цвет
    rgb = rgb * TINT * exposure
    piv = 0.18
    rgb = piv * np.power(np.maximum(rgb, 1e-6) / piv, contrast)   # контраст облаков вокруг среднего серого
    return rgb


def roll_to_sun(a):
    h, w = a.shape[:2]
    lum = a[..., 0] * 0.2126 + a[..., 1] * 0.7152 + a[..., 2] * 0.0722
    blur = lum.reshape(h // 8, 8, w // 8, 8).mean((1, 3))
    k = int(blur.argmax()); y, x = divmod(k, w // 8)
    u, v = (x + 0.5) / (w // 8), (y + 0.5) / (h // 8)
    shift = int(round((SUN_U - u) * w))
    return np.roll(a, shift, axis=1), v


def save(rgb, path, fmt, is_float):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new('out', w, h, alpha=False, float_buffer=is_float)
    out = np.ones((h, w, 4), dtype=np.float32); out[..., :3] = rgb
    img.pixels.foreach_set(out.ravel())
    img.filepath_raw = path; img.file_format = fmt
    if fmt == 'JPEG':
        bpy.context.scene.render.image_settings.quality = 88
    img.save()
    bpy.data.images.remove(img)
    print('SKY saved', path, os.path.getsize(path) // 1024, 'KB')


# ---- фон
a, v = roll_to_sun(load(4096, 2048))
el = math.degrees(math.pi * (v - 0.5))
print('SKY sun elevation %.1f deg, azimuth 38 deg' % el)
rgb = grade(a, 0.27, 2.0)
rgb = rgb / (1.0 + rgb) * 1.25                                   # мягкое сжатие светов
srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(np.clip(rgb, 0, None), 1 / 2.4) - 0.055)
save(np.clip(srgb, 0, 1), os.path.join(ROOT, 'assets', 'sky.jpg'), 'JPEG', False)

# ---- освещение (линейное, HDR)
b, _ = roll_to_sun(load(1024, 512))
save(grade(b, 0.5, 1.15), os.path.join(ROOT, 'assets', 'sky_env.hdr'), 'HDR', True)
