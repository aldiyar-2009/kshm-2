"""
Сборка фотореалистичной сцены КШМ-2 для Blender (Cycles).

Запуск (из папки проекта):
  blender --background --python blender/build_scene.py
Результат: blender/kshm2_scene.blend — модель, материалы, свет, площадка,
городское окружение, машина въезжает своим ходом, разборка «как у самолёта»,
развёртывание мачт; 6 камер под вертикальное видео 1080×1920 (Reels), 30 к/с.
"""
import bpy, math, os, sys
from mathutils import Vector, Quaternion

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
GLB = os.path.join(HERE, 'kshm2.glb')
GLB_DEPLOYED = os.path.join(HERE, 'kshm2_deployed.glb')
GLB_EXPLODED = os.path.join(HERE, 'kshm2_exploded.glb')
sys.path.insert(0, HERE)
from environment import build_environment
OUT_BLEND = os.path.join(HERE, 'kshm2_scene.blend')
# Дизайн: 'silver' — серебристый кузов с красной полосой и промзона (эскиз заказчика), 'classic' — как раньше
STYLE = os.environ.get('KSHM_STYLE', 'silver')

# ---------------------------------------------------------------- очистка
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.name = 'KSHM2'


def new_coll(name, parent=None):
    c = bpy.data.collections.new(name)
    (parent or scene.collection).children.link(c)
    return c


def import_glb(path, coll):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        coll.objects.link(o)
    # точечные лампы из веб-версии заменяем своим светом
    keep = [o for o in objs if o.type != 'LIGHT']
    for o in objs:
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    return keep


truck = new_coll('KSHM2')
objs = import_glb(GLB, truck)

# ---------------------------------------------------------------- монтаж (кадры, 30 к/с)
T = dict(
    drive=(1, 150),        # машина въезжает и останавливается
    orbit=(151, 240),      # облёт
    wheels=(241, 300),     # проезд камеры вдоль колёс
    xray=(301, 470),       # разборка «как у самолёта»: детали разлетаются, видно отсеки
    inside=(471, 560),     # операторский отсек изнутри
    deploy=(561, 700),     # мачты 10 м, антенна, двери
)
EXP = (320, 372, 420, 466)     # собрана → разобрана → пауза → снова собрана
DEP = (575, 690)


def basename(n):
    return n.rsplit('.', 1)[0] if n[-4:-3] == '.' and n[-3:].isdigit() else n


for o in objs:
    o.rotation_mode = 'QUATERNION'
rest = {o.name: (o.location.copy(), o.rotation_quaternion.copy(), o.scale.copy()) for o in objs}


def pose_from(path, label):
    tmp = new_coll('tmp_' + label)
    other = import_glb(path, tmp)
    by = {}
    for d in other:
        by[basename(d.name)] = (d.matrix_basis.to_translation(), d.matrix_basis.to_quaternion(), d.matrix_basis.to_scale())
    for d in other:
        bpy.data.objects.remove(d, do_unlink=True)
    bpy.data.collections.remove(tmp)
    return by


def animate(pose, keys, label):
    """keys: [(кадр, 'rest'|'pose'), ...] — ключи только у деталей, которые меняют положение."""
    n = 0
    for o in objs:
        p = pose.get(basename(o.name))
        if not p:
            continue
        r = rest[o.name]
        if (r[0] - p[0]).length < 1e-4 and r[1].rotation_difference(p[1]).angle < 1e-4 and (r[2] - p[2]).length < 1e-4:
            continue
        for f, which in keys:
            src = r if which == 'rest' else p
            o.location, o.rotation_quaternion, o.scale = src[0], src[1], src[2]
            for path in ('location', 'rotation_quaternion', 'scale'):
                o.keyframe_insert(path, frame=f)
        o.location, o.rotation_quaternion, o.scale = r
        n += 1
    print(label, 'animated', n)


animate(pose_from(GLB_EXPLODED, 'exp'), [(EXP[0], 'rest'), (EXP[1], 'pose'), (EXP[2], 'pose'), (EXP[3], 'rest')], 'EXPLODE:')
animate(pose_from(GLB_DEPLOYED, 'dep'), [(DEP[0], 'rest'), (DEP[1], 'pose')], 'DEPLOY:')

# ---------------------------------------------------------------- фаски на рёбрах
# реальные детали никогда не имеют идеально острых рёбер — фаска ловит блик
for o in objs:
    if o.type != 'MESH':
        continue
    dims = sorted(o.dimensions)
    if dims[0] < 0.004:          # плоскости и экраны
        continue
    m = o.modifiers.new('Фаска', 'BEVEL')
    m.width = min(0.008, dims[0] * 0.3)
    m.segments = 2
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(35)
    m.harden_normals = False
    try:
        m.use_clamp_overlap = True
    except AttributeError:
        pass

# ---------------------------------------------------------------- материалы


def base(name):
    return name.split('.')[0]


def bsdf_of(mat):
    if not mat.use_nodes:
        mat.use_nodes = True
    for n in mat.node_tree.nodes:
        if n.type == 'BSDF_PRINCIPLED':
            return n
    return None


def setin(n, key, val):
    if key in n.inputs:
        n.inputs[key].default_value = val


def unlink_input(mat, n, key):
    if key in n.inputs:
        for l in list(n.inputs[key].links):
            mat.node_tree.links.remove(l)


def add_noise_roughness(mat, n, lo, hi, scale=40.0, bump=0.0):
    """Неоднородная шероховатость + лёгкий микрорельеф — убирает «пластиковость»."""
    nt = mat.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise'); setin(nz, 'Scale', scale); setin(nz, 'Detail', 8.0)
    mr = nt.nodes.new('ShaderNodeMapRange')
    setin(mr, 'To Min', lo); setin(mr, 'To Max', hi)
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    if not n.inputs['Roughness'].links:
        nt.links.new(mr.outputs['Result'], n.inputs['Roughness'])
    if bump > 0:
        bp = nt.nodes.new('ShaderNodeBump'); setin(bp, 'Strength', bump); setin(bp, 'Distance', 0.002)
        nt.links.new(nz.outputs['Fac'], bp.inputs['Height'])
        nt.links.new(bp.outputs['Normal'], n.inputs['Normal'])


def add_grime(mat, n, zmax=1.4, amount=0.4, col=(0.32, 0.29, 0.25, 1)):
    """Дорожная грязь снизу вверх (по высоте в мире) с пятнистым шумом."""
    nt = mat.node_tree
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    h = nt.nodes.new('ShaderNodeMapRange')
    setin(h, 'From Min', 0.25); setin(h, 'From Max', zmax); setin(h, 'To Min', 1.0); setin(h, 'To Max', 0.0)
    nt.links.new(sep.outputs['Z'], h.inputs['Value'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); setin(nz, 'Scale', 3.5); setin(nz, 'Detail', 10.0); setin(nz, 'Roughness', 0.65)
    nt.links.new(geo.outputs['Position'], nz.inputs['Vector'])
    mul = nt.nodes.new('ShaderNodeMath'); mul.operation = 'MULTIPLY'
    nt.links.new(h.outputs['Result'], mul.inputs[0]); nt.links.new(nz.outputs['Fac'], mul.inputs[1])
    fac = nt.nodes.new('ShaderNodeMath'); fac.operation = 'MULTIPLY'; fac.inputs[1].default_value = amount * 1.6
    fac.use_clamp = True
    nt.links.new(mul.outputs[0], fac.inputs[0])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(fac.outputs[0], mix.inputs['Factor'])
    src = n.inputs['Base Color'].links[0].from_socket if n.inputs['Base Color'].links else None
    if src:
        nt.links.new(src, mix.inputs['A'])
    else:
        mix.inputs['A'].default_value = n.inputs['Base Color'].default_value
    mix.inputs['B'].default_value = col
    nt.links.new(mix.outputs['Result'], n.inputs['Base Color'])


def add_rain_streaks(mat, n, amount=0.14):
    """Вертикальные потёки от дождя: шум, сильно растянутый по высоте."""
    nt = mat.node_tree
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (14.0, 14.0, 0.35)
    nt.links.new(geo.outputs['Position'], mp.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); setin(nz, 'Scale', 2.0); setin(nz, 'Detail', 6.0)
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange'); setin(mr, 'From Min', 0.55); setin(mr, 'From Max', 0.75)
    setin(mr, 'To Min', 0.0); setin(mr, 'To Max', amount)
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    nt.links.new(mr.outputs['Result'], mix.inputs['Factor'])
    src = n.inputs['Base Color'].links[0].from_socket if n.inputs['Base Color'].links else None
    if src:
        nt.links.new(src, mix.inputs['A'])
    else:
        mix.inputs['A'].default_value = n.inputs['Base Color'].default_value
    mix.inputs['B'].default_value = (0.3, 0.29, 0.27, 1)
    nt.links.new(mix.outputs['Result'], n.inputs['Base Color'])


GLASS = {'glass', 'cabGlass', 'glassWin', 'frosted', 'water'}
EMIT = {'lampWhite': ((1.0, 0.95, 0.85), 12), 'lampBlue': ((0.15, 0.35, 1.0), 25),
        'lampRed': ((1.0, 0.1, 0.05), 15), 'lampAmber': ((1.0, 0.55, 0.08), 12),
        'led': ((1.0, 0.95, 0.88), 8)}

for mat in bpy.data.materials:
    n = bsdf_of(mat)
    if not n:
        continue
    b = base(mat.name)
    if STYLE == 'silver' and b in ('orange', 'blue'):
        setin(n, 'Base Color', (0.62, 0.02, 0.02, 1)); setin(n, 'Roughness', 0.3)   # одна красная полоса
        continue
    if b in ('paint', 'skin'):
        if STYLE == 'silver':
            setin(n, 'Metallic', 0.35)
        setin(n, 'Roughness', 0.22); setin(n, 'Coat Weight', 1.0); setin(n, 'Coat Roughness', 0.03)
        if not n.inputs['Base Color'].links:
            k = (0.66, 0.68, 0.71) if STYLE == 'silver' else (0.84, 0.84, 0.84)
            c = n.inputs['Base Color'].default_value; setin(n, 'Base Color', (c[0] * k[0], c[1] * k[1], c[2] * k[2], 1))
        else:
            dim = mat.node_tree.nodes.new('ShaderNodeMix'); dim.data_type = 'RGBA'; dim.blend_type = 'MULTIPLY'
            dim.inputs['Factor'].default_value = 1.0; dim.inputs['B'].default_value = (0.66, 0.68, 0.71, 1) if STYLE == 'silver' else (0.84, 0.84, 0.84, 1)
            mat.node_tree.links.new(n.inputs['Base Color'].links[0].from_socket, dim.inputs['A'])
            mat.node_tree.links.new(dim.outputs['Result'], n.inputs['Base Color'])
        setin(n, 'Coat IOR', 1.5)
        add_noise_roughness(mat, n, 0.18, 0.3, scale=60, bump=0.02)   # «апельсиновая корка» лака
        add_grime(mat, n, zmax=1.9, amount=0.35)
        add_rain_streaks(mat, n)
        setin(n, 'Coat Roughness', 0.015)                             # мокрый лак
    elif b in GLASS:
        unlink_input(mat, n, 'Alpha'); setin(n, 'Alpha', 1.0)
        setin(n, 'Transmission Weight', 1.0); setin(n, 'Roughness', 0.0 if b != 'frosted' else 0.35)
        setin(n, 'IOR', 1.52 if b != 'water' else 1.33)
        tint = {'glass': (0.08, 0.1, 0.11, 1), 'cabGlass': (0.35, 0.42, 0.45, 1), 'glassWin': (0.55, 0.62, 0.66, 1),
                'frosted': (0.9, 0.93, 0.95, 1), 'water': (0.3, 0.6, 0.9, 1)}[b]
        unlink_input(mat, n, 'Base Color'); setin(n, 'Base Color', tint); setin(n, 'Metallic', 0.0)
        try:
            mat.surface_render_method = 'DITHERED'
        except Exception:
            pass
    elif b in EMIT:
        col, st = EMIT[b]
        setin(n, 'Emission Color', (*col, 1)); setin(n, 'Emission Strength', st)
    elif b == 'rubber':
        setin(n, 'Base Color', (0.018, 0.018, 0.018, 1)); setin(n, 'Specular IOR Level', 0.3)
        add_noise_roughness(mat, n, 0.75, 0.95, scale=120, bump=0.25)
        add_grime(mat, n, zmax=1.4, amount=0.5, col=(0.16, 0.14, 0.12, 1))
    elif b in ('rim', 'black', 'blackGloss', 'fender', 'plastic', 'seal', 'dash', 'darkMetal'):
        add_noise_roughness(mat, n, 0.35, 0.65, scale=80, bump=0.05)
        add_grime(mat, n, zmax=1.3, amount=0.35, col=(0.22, 0.2, 0.17, 1))
    elif b in ('chrome',):
        setin(n, 'Metallic', 1.0); setin(n, 'Roughness', 0.04)
    elif b in ('alu', 'steel', 'plate', 'grey'):
        setin(n, 'Metallic', 1.0)
        add_noise_roughness(mat, n, 0.18, 0.35, scale=200)

# ---------------------------------------------------------------- площадка (асфальт с редкими лужами)
bpy.ops.mesh.primitive_plane_add(size=600, location=(0, 0, 0))
ground = bpy.context.active_object; ground.name = 'Площадка_асфальт'
gm = bpy.data.materials.new('Асфальт'); gm.use_nodes = True
nt = gm.node_tree; p = nt.nodes['Principled BSDF']
tc = nt.nodes.new('ShaderNodeTexCoord')
vor = nt.nodes.new('ShaderNodeTexVoronoi'); setin(vor, 'Scale', 260.0)
grain = nt.nodes.new('ShaderNodeTexNoise'); setin(grain, 'Scale', 6.0); setin(grain, 'Detail', 12.0)
big = nt.nodes.new('ShaderNodeTexNoise'); setin(big, 'Scale', 0.08); setin(big, 'Detail', 4.0)
mid = nt.nodes.new('ShaderNodeTexNoise'); setin(mid, 'Scale', 0.6); setin(mid, 'Detail', 8.0); setin(mid, 'Roughness', 0.7)
for t in (vor, grain, big, mid):
    nt.links.new(tc.outputs['Object'], t.inputs['Vector'])
# цвет: асфальт с крошкой и пятнами износа
ramp = nt.nodes.new('ShaderNodeValToRGB')
ramp.color_ramp.elements[0].color = (0.018, 0.018, 0.02, 1)
ramp.color_ramp.elements[1].color = (0.075, 0.072, 0.068, 1)
wear = nt.nodes.new('ShaderNodeMath'); wear.operation = 'MULTIPLY_ADD'
nt.links.new(grain.outputs['Fac'], wear.inputs[0]); wear.inputs[1].default_value = 0.7
nt.links.new(big.outputs['Fac'], wear.inputs[2])
mulw = nt.nodes.new('ShaderNodeMath'); mulw.operation = 'MULTIPLY'; mulw.inputs[1].default_value = 0.6
nt.links.new(wear.outputs[0], mulw.inputs[0])
nt.links.new(mulw.outputs[0], ramp.inputs['Fac'])
# лужи: маска из двух масштабов шума — неравномерно, без «камуфляжа»
pm = nt.nodes.new('ShaderNodeMath'); pm.operation = 'MULTIPLY'
nt.links.new(big.outputs['Fac'], pm.inputs[0]); nt.links.new(mid.outputs['Fac'], pm.inputs[1])
puddle = nt.nodes.new('ShaderNodeMapRange')
setin(puddle, 'From Min', 0.22); setin(puddle, 'From Max', 0.27)
setin(puddle, 'To Min', 0.0); setin(puddle, 'To Max', 1.0)
nt.links.new(pm.outputs[0], puddle.inputs['Value'])
rough = nt.nodes.new('ShaderNodeMapRange')
setin(rough, 'From Min', 0.0); setin(rough, 'From Max', 1.0); setin(rough, 'To Min', 0.48); setin(rough, 'To Max', 0.02)
nt.links.new(puddle.outputs['Result'], rough.inputs['Value'])
nt.links.new(rough.outputs['Result'], p.inputs['Roughness'])
dark = nt.nodes.new('ShaderNodeMix'); dark.data_type = 'RGBA'
nt.links.new(puddle.outputs['Result'], dark.inputs['Factor'])
nt.links.new(ramp.outputs['Color'], dark.inputs['A'])
dark.inputs['B'].default_value = (0.015, 0.015, 0.016, 1)
nt.links.new(dark.outputs['Result'], p.inputs['Base Color'])
bump = nt.nodes.new('ShaderNodeBump'); setin(bump, 'Strength', 0.55)
inv = nt.nodes.new('ShaderNodeMath'); inv.operation = 'MULTIPLY'
nt.links.new(vor.outputs['Distance'], inv.inputs[0])
one = nt.nodes.new('ShaderNodeMath'); one.operation = 'SUBTRACT'; one.inputs[0].default_value = 1.0
nt.links.new(puddle.outputs['Result'], one.inputs[1])
nt.links.new(one.outputs[0], inv.inputs[1])          # в лужах рельеф гладкий
nt.links.new(inv.outputs[0], bump.inputs['Height'])
nt.links.new(bump.outputs['Normal'], p.inputs['Normal'])
ground.data.materials.append(gm)

# разметка парковочного места: потёртая белая краска
lm = bpy.data.materials.new('Разметка'); lm.use_nodes = True
ln = lm.node_tree; lp = ln.nodes['Principled BSDF']
lt = ln.nodes.new('ShaderNodeTexCoord'); lz = ln.nodes.new('ShaderNodeTexNoise'); setin(lz, 'Scale', 9.0); setin(lz, 'Detail', 12.0)
ln.links.new(lt.outputs['Object'], lz.inputs['Vector'])
la = ln.nodes.new('ShaderNodeMapRange'); setin(la, 'From Min', 0.42); setin(la, 'From Max', 0.55)
ln.links.new(lz.outputs['Fac'], la.inputs['Value'])
lmix = ln.nodes.new('ShaderNodeMix'); lmix.data_type = 'RGBA'
ln.links.new(la.outputs['Result'], lmix.inputs['Factor'])
lmix.inputs['A'].default_value = (0.08, 0.08, 0.08, 1); lmix.inputs['B'].default_value = (0.75, 0.74, 0.7, 1)
ln.links.new(lmix.outputs['Result'], lp.inputs['Base Color']); setin(lp, 'Roughness', 0.7)
def paint_line(x0, x1, y0, y1):
    bpy.ops.mesh.primitive_plane_add(size=1, location=((x0 + x1) / 2, (y0 + y1) / 2, 0.003))
    o = bpy.context.active_object; o.scale = (abs(x1 - x0), abs(y1 - y0), 1); o.name = 'Разметка'
    o.data.materials.append(lm)
for y in (-2.45, 2.45):
    paint_line(-9.0, 8.0, y - 0.06, y + 0.06)
paint_line(7.94, 8.06, -2.45, 2.45)
for y in (-7.4, 7.4):
    paint_line(-9.0, 8.0, y - 0.06, y + 0.06)
for x in range(-8, 9, 4):   # штриховка соседнего места
    paint_line(x - 0.06, x + 0.06, 2.51, 7.34)

# ---------------------------------------------------------------- настоящее небо (HDRI Poly Haven, CC0) + солнце
SKY = os.path.join(HERE, 'sky_partly_cloudy_4k.hdr' if STYLE == 'silver' else 'sky_overcast_4k.hdr')
world = bpy.data.worlds.new('Небо'); scene.world = world; world.use_nodes = True
wn = world.node_tree; bg = wn.nodes['Background']
img = bpy.data.images.load(SKY)
env = wn.nodes.new('ShaderNodeTexEnvironment'); env.image = img
mp = wn.nodes.new('ShaderNodeMapping'); tcw = wn.nodes.new('ShaderNodeTexCoord')
wn.links.new(tcw.outputs['Generated'], mp.inputs['Vector'])
wn.links.new(mp.outputs['Vector'], env.inputs['Vector'])
if STYLE == 'silver':
    # тяжёлые штормовые тучи: камера видит контрастные облака (с отсечением солнца),
    # а свет в сцену идёт от спокойной обесцвеченной панорамы
    hs = wn.nodes.new('ShaderNodeHueSaturation'); hs.inputs['Saturation'].default_value = 0.22; hs.inputs['Value'].default_value = 0.9
    wn.links.new(env.outputs['Color'], hs.inputs['Color'])
    tint = wn.nodes.new('ShaderNodeMix'); tint.data_type = 'RGBA'; tint.blend_type = 'MULTIPLY'; tint.inputs['Factor'].default_value = 1.0
    tint.inputs['B'].default_value = (0.8, 0.87, 1.0, 1); wn.links.new(hs.outputs['Color'], tint.inputs['A'])
    clampn = wn.nodes.new('ShaderNodeMix'); clampn.data_type = 'RGBA'; clampn.blend_type = 'MIX'; clampn.clamp_result = True
    clampn.inputs['Factor'].default_value = 0.0; wn.links.new(tint.outputs['Result'], clampn.inputs['A'])
    gm_ = wn.nodes.new('ShaderNodeGamma'); gm_.inputs['Gamma'].default_value = 1.7
    wn.links.new(clampn.outputs['Result'], gm_.inputs['Color'])
    boost = wn.nodes.new('ShaderNodeMix'); boost.data_type = 'RGBA'; boost.blend_type = 'MULTIPLY'; boost.inputs['Factor'].default_value = 1.0
    boost.inputs['B'].default_value = (1.6, 1.6, 1.6, 1); wn.links.new(gm_.outputs['Color'], boost.inputs['A'])
    lp = wn.nodes.new('ShaderNodeLightPath')
    pick = wn.nodes.new('ShaderNodeMix'); pick.data_type = 'RGBA'
    wn.links.new(lp.outputs['Is Camera Ray'], pick.inputs['Factor'])
    wn.links.new(tint.outputs['Result'], pick.inputs['A']); wn.links.new(boost.outputs['Result'], pick.inputs['B'])
    wn.links.new(pick.outputs['Result'], bg.inputs['Color'])
else:
    wn.links.new(env.outputs['Color'], bg.inputs['Color'])
bg.inputs['Strength'].default_value = 0.55 if STYLE == 'silver' else 0.42   # сумерки — искусственный свет заметен

# находим солнце на панораме (самый яркий пиксель)
w, h = img.size
px = img.pixels[:]
best, bi = -1.0, 0
for i in range(0, w * h * 4, 4 * 7):
    l = px[i] * 0.2126 + px[i + 1] * 0.7152 + px[i + 2] * 0.0722
    if l > best:
        best, bi = l, i
k = bi // 4
u, v = (k % w + 0.5) / w, (k // w + 0.5) / h
az_img = -2 * math.pi * (u - 0.5)              # Cycles: u = -atan2(y, x)/2π + 0.5
el = math.pi * (v - 0.5)
SUN_AZ = math.radians(60)                      # хотим солнце спереди-слева
R = az_img - SUN_AZ
mp.inputs['Rotation'].default_value[2] = R
# направление на солнце в мире
th = az_img - R
sun_dir = Vector((math.cos(th) * math.cos(el), math.sin(th) * math.cos(el), math.sin(el)))
print('SUN on HDRI: u=%.3f v=%.3f elevation=%.1f°' % (u, v, math.degrees(el)))

sun_data = bpy.data.lights.new('Солнце', 'SUN')
sun_data.energy = 0.3
sun_data.angle = math.radians(1.0)
sun_data.color = (1.0, 0.93, 0.84)
sun = bpy.data.objects.new('Солнце', sun_data); scene.collection.objects.link(sun)
sun.rotation_euler = (-sun_dir).to_track_quat('-Z', 'Y').to_euler()

# ---------------------------------------------------------------- свет в отсеках
rooms = {'Отсек1': 1.65, 'Отсек2': -0.3, 'Отсек3': -2.17, 'Отсек4': -4.1}
for name, x in rooms.items():
    ld = bpy.data.lights.new(f'Свет_{name}', 'AREA')
    ld.shape = 'RECTANGLE'; ld.size = 1.3; ld.size_y = 0.25
    ld.energy = 70; ld.color = (1.0, 0.93, 0.85)
    lo = bpy.data.objects.new(f'Свет_{name}', ld); truck.objects.link(lo)
    lo.location = (x, 0, 3.58)

# фары включены — даёт «живой» кадр
for name, y in (('Фара_лев', 0.87), ('Фара_прав', -0.87)):
    ld = bpy.data.lights.new(name, 'SPOT'); ld.energy = 1800; ld.spot_size = math.radians(55)
    ld.spot_blend = 0.6; ld.color = (1.0, 0.95, 0.88); ld.shadow_soft_size = 0.08
    lo = bpy.data.objects.new(name, ld); truck.objects.link(lo)
    lo.location = (5.5, y, 1.05); lo.rotation_euler = (math.radians(90), 0, math.radians(-90 - 0))
    lo.rotation_euler = (0, math.radians(-85), 0)  # светит вперёд (+X) и чуть вниз

# ---------------------------------------------------------------- маячки, габариты, задние огни
def point(name, loc, energy, color, radius=0.05):
    ld = bpy.data.lights.new(name, 'POINT'); ld.energy = energy; ld.color = color; ld.shadow_soft_size = radius
    lo = bpy.data.objects.new(name, ld); truck.objects.link(lo); lo.location = loc
    return lo


beacons = [point('Маячок_лев', (4.95, 0.6, 3.52), 260, (0.12, 0.3, 1.0)), point('Маячок_прав', (4.95, -0.6, 3.52), 260, (0.12, 0.3, 1.0))]
for y in (-1.02, 1.02):
    point('Задний_огонь_кунг', (-5.32, y, 3.55), 25, (1.0, 0.08, 0.04))
    point('Задний_огонь', (-5.1, y * 0.88, 0.85), 30, (1.0, 0.08, 0.04))
for y in (-0.3, 0.0, 0.3):
    point('Габарит_кабины', (4.78, y, 3.2), 6, (1.0, 0.55, 0.1), 0.02)

# мигание маячков: двойная вспышка, левый и правый поочерёдно (период 0,8 с)
blue_mat = next((m for m in bpy.data.materials if base(m.name) == 'lampBlue'), None)
blue_bsdf = bsdf_of(blue_mat) if blue_mat else None
for f in range(1, T['deploy'][1] + 24, 24):
    for side, lo in enumerate(beacons):
        on = [f + side * 12 + d for d in (0, 5)]
        for t0 in on:
            lo.data.energy = 260; lo.data.keyframe_insert('energy', frame=t0)
            lo.data.energy = 0; lo.data.keyframe_insert('energy', frame=t0 + 3)
    if blue_bsdf:
        for t0 in (f, f + 5, f + 12, f + 17):
            blue_bsdf.inputs['Emission Strength'].default_value = 40
            blue_bsdf.inputs['Emission Strength'].keyframe_insert('default_value', frame=t0)
            blue_bsdf.inputs['Emission Strength'].default_value = 3
            blue_bsdf.inputs['Emission Strength'].keyframe_insert('default_value', frame=t0 + 3)
for idb in [lo.data for lo in beacons] + ([blue_mat.node_tree] if blue_mat else []):
    ad = idb.animation_data
    try:
        for fc in ad.action.fcurves:
            for k in fc.keyframe_points:
                k.interpolation = 'CONSTANT'
    except Exception:
        pass

# ---------------------------------------------------------------- городское окружение
build_environment(scene, 'industrial' if STYLE == 'silver' else 'city')

# ---------------------------------------------------------------- движение машины
FPS = 30
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, T['deploy'][1]

rig = bpy.data.objects.new('KSHM2_Движение', None); rig.empty_display_size = 2
truck.objects.link(rig)
for o in list(truck.objects):
    if o is not rig and o.parent is None:
        o.parent = rig
X0, WR = -42.0, 0.635
f0, f1 = T['drive']


def drive_x(f):
    t = min(1.0, max(0.0, (f - f0) / (f1 - f0)))
    return X0 * (1 - t) ** 3            # плавное торможение до остановки (ease-out cubic)


for f in range(f0, f1 + 1, 2):
    rig.location = (drive_x(f), 0, 0); rig.keyframe_insert('location', frame=f)
rig.location = (0, 0, 0); rig.keyframe_insert('location', frame=f1)
# колёса: угол поворота = пройденный путь / радиус
spinners = [c for o in objs if o.name.startswith('wheels_') for c in o.children if c.type == 'EMPTY']
for s in spinners:
    s.rotation_mode = 'QUATERNION'
    q0 = s.rotation_quaternion.copy()
    for f in range(f0, f1 + 1, 2):
        th = (drive_x(f) - X0) / WR
        s.rotation_quaternion = Quaternion((0, 1, 0), th) @ q0
        s.keyframe_insert('rotation_quaternion', frame=f)
print('WHEELS spinning:', len(spinners))


def empty(name, loc, parent=None):
    e = bpy.data.objects.new(name, None); e.location = loc; e.empty_display_size = 0.3
    scene.collection.objects.link(e)
    if parent:
        e.parent = parent
    return e


def camera(name, lens, target, fstop=4.0):
    cd = bpy.data.cameras.new(name); cd.lens = lens; cd.sensor_width = 36
    cd.dof.use_dof = True; cd.dof.focus_object = target; cd.dof.aperture_fstop = fstop
    cd.clip_start = 0.02
    c = bpy.data.objects.new(name, cd); scene.collection.objects.link(c)
    tr = c.constraints.new('TRACK_TO'); tr.target = target
    tr.track_axis = 'TRACK_NEGATIVE_Z'; tr.up_axis = 'UP_Y'
    return c


def key(obj, frame, loc):
    obj.location = loc; obj.keyframe_insert('location', frame=frame)


cams = []
# 1. Въезд: низкая камера у края площадки, цель «едет» вместе с машиной
tV = empty('Цель_въезд', (2.5, 0, 1.6), parent=rig)
cV = camera('CAM_1_Въезд', 30, tV, 4.0)
key(cV, 1, (13.0, -8.5, 0.8)); key(cV, 150, (11.0, -9.5, 1.15)); cams.append((T['drive'][0], cV, tV))

# 2. Облёт спереди-справа к борту
tA = empty('Цель_облёт', (2.6, 0, 1.75))
cA = camera('CAM_2_Облёт', 32, tA, 5.6)
for f, ang, r, z in ((T['orbit'][0], -12, 14.5, 1.15), (T['orbit'][1], -95, 12.5, 1.6)):
    a = math.radians(ang)
    key(cA, f, (1.0 + r * math.cos(a), r * math.sin(a), z))
key(tA, T['orbit'][0], (2.6, 0, 1.75)); key(tA, T['orbit'][1], (0.2, 0, 1.9)); cams.append((T['orbit'][0], cA, tA))

# 3. Вдоль колёс по солнечной стороне
tB = empty('Цель_колёса', (4.2, 1.0, 0.75))
cB = camera('CAM_3_Колёса', 20, tB, 2.8)
key(cB, T['wheels'][0], (6.8, 5.0, 0.4)); key(cB, T['wheels'][1], (-4.4, 5.3, 0.45))
key(tB, T['wheels'][0], (4.2, 1.0, 0.75)); key(tB, T['wheels'][1], (-1.3, 1.0, 0.8)); cams.append((T['wheels'][0], cB, tB))

# 4. Разборка: высокий облёт, детали разлетаются и собираются (как в видео с самолётом)
tX = empty('Цель_разборка', (0, 0, 2.6))
cX = camera('CAM_4_Разборка', 24, tX, 11.0)
key(cX, T['xray'][0], (15.0, -11.0, 5.0)); key(cX, (T['xray'][0] + T['xray'][1]) // 2, (6.0, -17.0, 8.5))
key(cX, T['xray'][1], (-9.0, -15.0, 6.5))
key(tX, T['xray'][0], (0.5, 0, 2.2)); key(tX, T['xray'][1], (-0.5, 0, 3.0)); cams.append((T['xray'][0], cX, tX))

# 5. Операторский отсек изнутри
tD = empty('Цель_отсек', (-0.9, 1.0, 2.6))
cD = camera('CAM_5_Отсек', 16, tD, 11.0)
key(cD, T['inside'][0], (0.55, -0.35, 3.05)); key(cD, T['inside'][1], (0.35, -0.15, 3.1))
key(tD, T['inside'][0], (-0.9, 1.0, 2.6)); key(tD, T['inside'][1], (0.1, 1.05, 2.75)); cams.append((T['inside'][0], cD, tD))

# 6. Развёртывание: мачты 10 м
tE = empty('Цель_мачты', (1.0, 0, 2.4))
cE = camera('CAM_6_Развёртывание', 20, tE, 8.0)
key(cE, T['deploy'][0], (8.0, 6.2, 0.8)); key(cE, T['deploy'][1], (9.5, 7.6, 1.2))
key(tE, T['deploy'][0], (1.0, 0, 2.4)); key(tE, T['deploy'][1], (-0.5, 0, 6.0)); cams.append((T['deploy'][0], cE, tE))

for _, c, t in cams:
    for o in (c, t):
        ad = o.animation_data
        if not (ad and ad.action):
            continue
        try:
            for fc in ad.action.fcurves:
                for k in fc.keyframe_points:
                    k.interpolation = 'BEZIER'; k.easing = 'EASE_IN_OUT'
        except Exception:
            pass

for f, c, _ in cams:
    m = scene.timeline_markers.new(c.name, frame=f); m.camera = c
scene.camera = cV

# ---------------------------------------------------------------- дымка вдали (композитор)
try:
    vl = bpy.context.view_layer
    vl.use_pass_mist = True
    scene.world.mist_settings.start = 12.0
    scene.world.mist_settings.depth = 110.0
    scene.world.mist_settings.falloff = 'QUADRATIC'
    ng = bpy.data.node_groups.new('Дымка', 'CompositorNodeTree')
    ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
    rl = ng.nodes.new('CompositorNodeRLayers'); out = ng.nodes.new('NodeGroupOutput')
    amt = ng.nodes.new('ShaderNodeMath'); amt.operation = 'MULTIPLY'; amt.inputs[1].default_value = 0.55
    ng.links.new(rl.outputs['Mist'], amt.inputs[0])
    mx = ng.nodes.new('ShaderNodeMix'); mx.data_type = 'RGBA'
    ng.links.new(amt.outputs[0], mx.inputs['Factor'])
    ng.links.new(rl.outputs['Image'], mx.inputs['A'])
    mx.inputs['B'].default_value = (0.36, 0.38, 0.41, 1)    # цвет пасмурной дымки
    ng.links.new(mx.outputs['Result'], out.inputs['Image'])
    scene.compositing_node_group = ng
    scene.render.use_compositing = True
    print('MIST ok')
except Exception as e:
    print('MIST skipped:', e)

# ---------------------------------------------------------------- рендер
r = scene.render
r.engine = 'CYCLES'
r.resolution_x, r.resolution_y, r.resolution_percentage = 1080, 1920, 100
r.use_motion_blur = True
r.motion_blur_shutter = 0.5
cy = scene.cycles
cy.samples = 160
cy.use_adaptive_sampling = True
cy.adaptive_threshold = 0.02
cy.use_denoising = True
cy.max_bounces = 10
cy.caustics_reflective = False
cy.caustics_refractive = False
try:
    prefs = bpy.context.preferences.addons['cycles'].preferences
    for dev in ('OPTIX', 'CUDA'):
        try:
            prefs.compute_device_type = dev
            prefs.get_devices()
            if any(d.type == dev for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == dev
                cy.device = 'GPU'
                break
        except Exception:
            continue
except Exception:
    pass
vs = scene.view_settings
for vt in ('AgX', 'Filmic'):
    try:
        vs.view_transform = vt; break
    except Exception:
        pass
for look in ('AgX - Medium High Contrast', 'AgX - Punchy', 'Medium High Contrast'):
    try:
        vs.look = look; break
    except Exception:
        pass
vs.exposure = -0.2
# вывод: последовательность PNG (надёжнее всего для монтажа)
r.image_settings.file_format = 'PNG'
r.filepath = os.path.join(HERE, 'renders', 'frames', 'kshm2_')

bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND)
print('SAVED', OUT_BLEND, 'objects:', len(bpy.data.objects))
