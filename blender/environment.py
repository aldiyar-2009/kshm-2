"""
Городское окружение как на видео PIRANT: кирпичные многоэтажки, синие модульные
здания, фонари, столб видеонаблюдения, бордюры. Всё процедурное, без внешних текстур.
Вызывается из build_scene.py: build_environment(scene)
"""
import bpy, math, random


def _setin(n, key, val):
    if key in n.inputs:
        n.inputs[key].default_value = val


def _facade_mesh(name, w, d, h):
    """Коробка-здание: 4 фасада с UV в метрах (u — вдоль фасада, v — высота) + крыша."""
    x, y = w / 2, d / 2
    verts, faces, uvs, mats = [], [], [], []
    walls = [((-x, -y), (x, -y), w), ((x, -y), (x, y), d), ((x, y), (-x, y), w), ((-x, y), (-x, -y), d)]
    for (a, b, L) in walls:
        i = len(verts)
        verts += [(a[0], a[1], 0), (b[0], b[1], 0), (b[0], b[1], h), (a[0], a[1], h)]
        faces.append((i, i + 1, i + 2, i + 3)); uvs.append([(0, 0), (L, 0), (L, h), (0, h)]); mats.append(0)
    i = len(verts)
    verts += [(-x, -y, h), (x, -y, h), (x, y, h), (-x, y, h)]
    faces.append((i, i + 1, i + 2, i + 3)); uvs.append([(0, 0), (w, 0), (w, d), (0, d)]); mats.append(1)
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    uvl = me.uv_layers.new(name='UVMap')
    k = 0
    for fi, poly in enumerate(me.polygons):
        poly.material_index = mats[fi]
        for li, loop in enumerate(poly.loop_indices):
            uvl.data[loop].uv = uvs[fi][li]
    me.update()
    return me


def _brick_facade_material(name, brick_a, brick_b, mortar, floor_h=2.9, bay=3.3, seed=0.0):
    """Кирпич + сетка окон (рамы, стекло, часть окон светится) — по UV в метрах."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; P = nt.nodes['Principled BSDF']; L = nt.links.new
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    sep = nt.nodes.new('ShaderNodeSeparateXYZ'); L(uv.outputs['UV'], sep.inputs[0])
    # кирпич
    br = nt.nodes.new('ShaderNodeTexBrick')
    _setin(br, 'Color1', (*brick_a, 1)); _setin(br, 'Color2', (*brick_b, 1)); _setin(br, 'Mortar', (*mortar, 1))
    _setin(br, 'Scale', 1.0); _setin(br, 'Mortar Size', 0.01); _setin(br, 'Brick Width', 0.25); _setin(br, 'Row Height', 0.075)
    L(uv.outputs['UV'], br.inputs['Vector'])

    def math(op, a, b=None, clamp=False):
        n = nt.nodes.new('ShaderNodeMath'); n.operation = op; n.use_clamp = clamp
        for idx, v in enumerate((a, b)):
            if v is None:
                continue
            if isinstance(v, (int, float)):
                n.inputs[idx].default_value = v
            else:
                L(v, n.inputs[idx])
        return n.outputs[0]

    def window_mask(coord, period, lo, hi):
        f = math('FRACT', math('DIVIDE', coord, period))
        return math('MULTIPLY', math('GREATER_THAN', f, lo), math('LESS_THAN', f, hi))

    u, v = sep.outputs['X'], sep.outputs['Y']
    above = math('GREATER_THAN', v, 2.6)                    # первый этаж — цоколь без окон
    wx = window_mask(u, bay, 0.28, 0.72); wy = window_mask(v, floor_h, 0.3, 0.78)
    win = math('MULTIPLY', math('MULTIPLY', wx, wy), above)
    fx = window_mask(u, bay, 0.25, 0.75); fy = window_mask(v, floor_h, 0.26, 0.82)
    frame = math('SUBTRACT', math('MULTIPLY', math('MULTIPLY', fx, fy), above), win, clamp=True)
    # случайные горящие окна (ячейка окна → белый шум)
    cell = nt.nodes.new('ShaderNodeCombineXYZ')
    L(math('FLOOR', math('DIVIDE', u, bay)), cell.inputs['X'])
    L(math('FLOOR', math('DIVIDE', v, floor_h)), cell.inputs['Y'])
    _setin(cell, 'Z', seed)
    wn = nt.nodes.new('ShaderNodeTexWhiteNoise'); wn.noise_dimensions = '3D'
    L(cell.outputs[0], wn.inputs['Vector'])
    lit = math('MULTIPLY', math('GREATER_THAN', wn.outputs['Value'], 0.7), win)
    var = nt.nodes.new('ShaderNodeSeparateColor'); L(wn.outputs['Color'], var.inputs['Color'])
    # цоколь — бетон
    plinth = nt.nodes.new('ShaderNodeMix'); plinth.data_type = 'RGBA'
    L(above, plinth.inputs['Factor']); _setin(plinth, 'A', (0.32, 0.31, 0.3, 1)); L(br.outputs['Color'], plinth.inputs['B'])
    c1 = nt.nodes.new('ShaderNodeMix'); c1.data_type = 'RGBA'
    L(frame, c1.inputs['Factor']); L(plinth.outputs['Result'], c1.inputs['A']); _setin(c1, 'B', (0.85, 0.85, 0.83, 1))
    c2 = nt.nodes.new('ShaderNodeMix'); c2.data_type = 'RGBA'
    L(win, c2.inputs['Factor']); L(c1.outputs['Result'], c2.inputs['A']); _setin(c2, 'B', (0.02, 0.025, 0.03, 1))
    L(c2.outputs['Result'], P.inputs['Base Color'])
    rough = nt.nodes.new('ShaderNodeMapRange'); _setin(rough, 'To Min', 0.85); _setin(rough, 'To Max', 0.05)
    L(win, rough.inputs['Value']); L(rough.outputs['Result'], P.inputs['Roughness'])
    ecol = nt.nodes.new('ShaderNodeMix'); ecol.data_type = 'RGBA'
    L(var.outputs[1], ecol.inputs['Factor']); _setin(ecol, 'A', (1.0, 0.68, 0.38, 1)); _setin(ecol, 'B', (0.82, 0.88, 1.0, 1))
    L(ecol.outputs['Result'], P.inputs['Emission Color'])
    L(math('MULTIPLY', lit, math('ADD', math('MULTIPLY', var.outputs[0], 2.2), 0.35)), P.inputs['Emission Strength'])
    bump = nt.nodes.new('ShaderNodeBump'); _setin(bump, 'Strength', 0.4); _setin(bump, 'Distance', 0.02)
    L(br.outputs['Fac'], bump.inputs['Height']); L(bump.outputs['Normal'], P.inputs['Normal'])
    return m


def _simple(name, color, rough=0.6, metal=0.0, emit=None):
    m = bpy.data.materials.new(name); m.use_nodes = True
    P = m.node_tree.nodes['Principled BSDF']
    _setin(P, 'Base Color', (*color, 1)); _setin(P, 'Roughness', rough); _setin(P, 'Metallic', metal)
    if emit:
        _setin(P, 'Emission Color', (*emit[0], 1)); _setin(P, 'Emission Strength', emit[1])
    return m


def _corrugated(name, color):
    """Профлист синих модульных зданий: волны по горизонтали + лёгкая грязь."""
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; P = nt.nodes['Principled BSDF']; L = nt.links.new
    uv = nt.nodes.new('ShaderNodeUVMap'); uv.uv_map = 'UVMap'
    wave = nt.nodes.new('ShaderNodeTexWave'); wave.wave_type = 'BANDS'; wave.bands_direction = 'X'
    _setin(wave, 'Scale', 6.0); L(uv.outputs['UV'], wave.inputs['Vector'])
    bump = nt.nodes.new('ShaderNodeBump'); _setin(bump, 'Strength', 0.6); _setin(bump, 'Distance', 0.01)
    L(wave.outputs['Fac'], bump.inputs['Height']); L(bump.outputs['Normal'], P.inputs['Normal'])
    _setin(P, 'Base Color', (*color, 1)); _setin(P, 'Roughness', 0.45); _setin(P, 'Metallic', 0.3)
    return m


def _box(name, coll, size, loc, mat, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object; o.name = name; o.scale = size; o.rotation_euler[2] = rot
    o.data.materials.append(mat)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    return o


def _cyl(name, coll, r, h, loc, mat, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=20)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(mat)
    for c in list(o.users_collection):
        c.objects.unlink(o)
    coll.objects.link(o)
    return o


def _industrial(coll, rnd):
    """Промзона как на эскизе: большие склады из серого профлиста, ворота, настенные прожекторы."""
    wall = _corrugated('Профлист_серый', (0.3, 0.33, 0.37))
    band = _corrugated('Профлист_тёмный', (0.13, 0.15, 0.18))
    roofm = _simple('Кровля_склада', (0.2, 0.21, 0.22), 0.6, 0.4)
    door = _simple('Ворота', (0.42, 0.44, 0.46), 0.5, 0.6)
    lampm = _simple('Прожектор_склада', (0.9, 0.9, 0.85), 0.2, 0.0, ((1.0, 0.9, 0.75), 30.0))
    for k in range(9):
        ang = math.radians(-170 + k * 40 + rnd.uniform(-5, 5))
        r = rnd.uniform(48, 64)
        L, D, H = rnd.uniform(70, 110), 30.0, rnd.uniform(9.0, 12.0)
        cx, cy = r * math.cos(ang), r * math.sin(ang); rot = ang + math.pi / 2
        me = _facade_mesh(f'Склад_{k}', L, D, H); me.materials.append(wall); me.materials.append(roofm)
        o = bpy.data.objects.new(f'Склад_{k}', me); coll.objects.link(o); o.location = (cx, cy, 0); o.rotation_euler[2] = rot
        _box(f'Склад_цоколь_{k}', coll, (L + 0.1, D + 0.1, 1.2), (cx, cy, 0.6), band, rot)
        _box(f'Склад_парапет_{k}', coll, (L + 0.3, D + 0.3, 0.5), (cx, cy, H + 0.25), roofm, rot)
        # ворота и прожекторы на фасаде, обращённом к площадке
        nx, ny = -math.cos(ang), -math.sin(ang)          # нормаль фасада к центру
        tx, ty = math.cos(rot), math.sin(rot)
        for j in range(-2, 3):
            px, py = cx + nx * (D / 2 + 0.06) + tx * j * 16, cy + ny * (D / 2 + 0.06) + ty * j * 16
            _box(f'Ворота_{k}_{j}', coll, (5.0, 0.12, 5.5), (px, py, 2.75), door, rot)
            _box(f'Прожектор_{k}_{j}', coll, (0.6, 0.3, 0.25), (px + nx * 0.2, py + ny * 0.2, 6.6), lampm, rot)
            if abs(j) <= 1:
                ld = bpy.data.lights.new(f'Склад_свет_{k}_{j}', 'SPOT'); ld.energy = 1500; ld.spot_size = math.radians(110)
                ld.spot_blend = 0.8; ld.color = (1.0, 0.85, 0.65)
                lo = bpy.data.objects.new(f'Склад_свет_{k}_{j}', ld); coll.objects.link(lo)
                lo.location = (px + nx * 0.5, py + ny * 0.5, 6.5)
                lo.rotation_euler = (math.radians(35), 0, math.atan2(ny, nx) + math.pi / 2)


def build_environment(scene, style='city'):
    rnd = random.Random(7)
    coll = bpy.data.collections.new('Окружение_город'); scene.collection.children.link(coll)
    city = style == 'city'
    if not city:
        _industrial(coll, rnd)

    # ---- многоэтажки по кругу (как кварталы на видео)
    bricks = [
        _brick_facade_material('Кирпич_рыжий', (0.42, 0.16, 0.08), (0.5, 0.2, 0.1), (0.6, 0.55, 0.5), seed=1),
        _brick_facade_material('Кирпич_красный', (0.36, 0.11, 0.07), (0.44, 0.15, 0.09), (0.55, 0.5, 0.46), seed=2),
        _brick_facade_material('Кирпич_песочный', (0.62, 0.45, 0.3), (0.7, 0.52, 0.36), (0.75, 0.72, 0.68), seed=3),
    ]
    roof = _simple('Крыша_дома', (0.12, 0.12, 0.13), 0.8)
    for k in range(11 if city else 0):
        ang = math.radians(-160 + k * 33 + rnd.uniform(-6, 6))
        r = rnd.uniform(60, 80)
        floors = rnd.choice([5, 5, 9, 9, 10, 12])
        w, d, h = rnd.uniform(38, 62), 13.0, floors * 2.9 + 1.2
        me = _facade_mesh(f'Дом_{k}', w, d, h)
        me.materials.append(bricks[k % 3]); me.materials.append(roof)
        o = bpy.data.objects.new(f'Дом_{k}', me); coll.objects.link(o)
        o.location = (r * math.cos(ang), r * math.sin(ang), 0)
        o.rotation_euler[2] = ang + math.pi / 2       # длинным фасадом к площадке
        # парапет крыши
        _box(f'Парапет_{k}', coll, (w + 0.3, d + 0.3, 0.6), (o.location.x, o.location.y, h + 0.3), roof, ang + math.pi / 2)

    # ---- синие модульные здания (бытовки) за площадкой
    blue = _corrugated('Профлист_синий', (0.05, 0.16, 0.45))
    white = _simple('Модуль_рама', (0.85, 0.86, 0.86), 0.5)
    dark = _simple('Модуль_окно', (0.02, 0.025, 0.03), 0.05)
    for k, (x, y, rz) in enumerate([(-16, 15, 0.05), (-9.5, 15.3, 0.05), (-3, 15.6, 0.05), (9, 17, -0.3), (15, 19.5, -0.3)] if city else []):
        L, W, H = 6.1, 2.45, 2.75
        me = _facade_mesh(f'Модуль_{k}', L, W, H)
        me.materials.append(blue); me.materials.append(white)
        o = bpy.data.objects.new(f'Модуль_{k}', me); coll.objects.link(o)
        o.location = (x, y, 0.2); o.rotation_euler[2] = rz
        for sx in (-1, 1):
            for sy in (-1, 1):
                _cyl(f'Модуль_стойка_{k}', coll, 0.07, H, (x + sx * L / 2 * math.cos(rz) - sy * W / 2 * math.sin(rz),
                                                          y + sx * L / 2 * math.sin(rz) + sy * W / 2 * math.cos(rz), 0.2 + H / 2), white)
        _box(f'Модуль_крыша_{k}', coll, (L + 0.15, W + 0.15, 0.18), (x, y, 0.2 + H + 0.09), white, rz)
        _box(f'Модуль_окно_{k}', coll, (1.2, 0.05, 1.0), (x - 1.2 * math.cos(rz) + 1.23 * math.sin(rz) * -1, y - 1.2 * math.sin(rz) - 1.24 * math.cos(rz), 1.6), dark, rz)
        _box(f'Модуль_фундамент_{k}', coll, (L, W, 0.2), (x, y, 0.1), _simple('Блоки', (0.3, 0.3, 0.29), 0.9), rz)

    # ---- фонари вдоль проезда
    pole = _simple('Опора_металл', (0.45, 0.46, 0.48), 0.4, 0.8)
    lampm = _simple('Плафон', (0.9, 0.9, 0.85), 0.2, 0.0, ((1.0, 0.78, 0.5), 25.0))
    for k, (x, y, face) in enumerate([(-34, -17, 1), (-14, -17, 1), (6, -17, 1), (26, -17, 1), (-22, 10.5, -1), (0, 11.0, -1), (20, 11.5, -1)]):
        _cyl(f'Фонарь_опора_{k}', coll, 0.09, 9.0, (x, y, 4.5), pole)
        _cyl(f'Фонарь_кронштейн_{k}', coll, 0.04, 1.6, (x, y + face * 0.75, 8.9), pole, (math.radians(90), 0, 0))
        _box(f'Фонарь_головка_{k}', coll, (0.35, 0.6, 0.12), (x, y + face * 1.5, 8.85), lampm)
        ld = bpy.data.lights.new(f'Фонарь_свет_{k}', 'SPOT'); ld.energy = 2200; ld.spot_size = math.radians(120)
        ld.spot_blend = 0.85; ld.color = (1.0, 0.72, 0.42); ld.shadow_soft_size = 0.25
        lo = bpy.data.objects.new(f'Фонарь_свет_{k}', ld); coll.objects.link(lo); lo.location = (x, y + face * 1.5, 8.7)

    # ---- столб видеонаблюдения с поворотной камерой (как на видео)
    _cyl('Столб_камеры', coll, 0.11, 7.5, (-7, 8.5, 3.75), pole)
    _box('Кронштейн_камеры', coll, (0.6, 0.06, 0.06), (-6.75, 8.5, 7.3), pole)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.16, location=(-6.5, 8.5, 7.12))
    cam = bpy.context.active_object; cam.name = 'Купольная_камера'
    cam.data.materials.append(_simple('Камера_белая', (0.9, 0.9, 0.9), 0.3))
    # прожекторы на синих модулях
    for k, (x, y) in enumerate([(-12.7, 13.6), (9.0, 15.6)]):
        ld = bpy.data.lights.new(f'Прожектор_модуля_{k}', 'SPOT'); ld.energy = 900; ld.spot_size = math.radians(90)
        ld.spot_blend = 0.6; ld.color = (0.95, 0.97, 1.0)
        lo = bpy.data.objects.new(f'Прожектор_модуля_{k}', ld); coll.objects.link(lo); lo.location = (x, y, 3.2)
        lo.rotation_euler = (math.radians(55), 0, math.radians(180))
    for c in list(cam.users_collection):
        c.objects.unlink(cam)
    coll.objects.link(cam)

    # ---- бордюры площадки
    curb = _simple('Бордюр', (0.55, 0.54, 0.52), 0.85)
    for (cx, cy, sx, sy) in [(0, -9.5, 90, 0.18), (0, 13.0, 90, 0.18)]:
        _box('Бордюр', coll, (sx, sy, 0.16), (cx, cy, 0.08), curb)
    # тротуар перед модулями
    _box('Тротуар', coll, (90, 6, 0.12), (0, 16.2, 0.06), _simple('Плитка', (0.38, 0.37, 0.36), 0.8))
    return coll
