"""
Подключает к Blender дополнение MCP из репозитория Blender Lab — через него Claude
управляет открытым Blender напрямую (сервер на localhost:9876).
Запуск: blender --background --python blender/setup_blender_mcp.py
"""
import bpy

prefs = bpy.context.preferences
prefs.system.use_online_access = True          # разрешаем Blender ходить в репозитории расширений

URL = 'https://lab.blender.org/'
repos = prefs.extensions.repos
repo = next((r for r in repos if r.remote_url.rstrip('/') == URL.rstrip('/')), None)
if repo is None:
    bpy.ops.preferences.extension_repo_add(name='Blender Lab', remote_url=URL, type='REMOTE')
    repo = next(r for r in repos if r.remote_url.rstrip('/') == URL.rstrip('/'))
repo.enabled = True
repo.use_sync_on_startup = True
idx = list(repos).index(repo)
print('REPO', repo.name, repo.module, idx)

bpy.ops.extensions.repo_sync_all()

# список пакетов репозитория
from bl_pkg import repo_cache_store_ensure  # noqa
store = repo_cache_store_ensure()
pkgs = {}
for i, manifest in enumerate(store.pkg_manifest_from_remote_ensure(error_fn=print)):
    if repos[i].module == repo.module and manifest:
        pkgs = manifest
print('PACKAGES', sorted(pkgs.keys()))

pkg_id = next((k for k in pkgs if 'mcp' in k.lower()), None)
print('PKG', pkg_id)
if pkg_id:
    bpy.ops.extensions.package_install(repo_index=idx, pkg_id=pkg_id, enable_on_install=True)
    mod = 'bl_ext.%s.%s' % (repo.module, pkg_id)
    if mod not in prefs.addons:
        bpy.ops.preferences.addon_enable(module=mod)
    print('ENABLED', mod, mod in prefs.addons)

# Node Wrangler — удобная работа с материалами
try:
    bpy.ops.preferences.addon_enable(module='node_wrangler')
except Exception as e:
    print('NW', e)

bpy.ops.wm.save_userpref()
print('SAVED PREFS')
