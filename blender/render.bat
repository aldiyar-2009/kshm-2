@echo off
rem KSHM-2 video render: 1080x1920, 30 fps, 700 frames (about 6-7 hours on RTX 4050).
rem You can close this window and run it again - finished frames are skipped.
set "BLENDER=C:\Users\aldia\OneDrive\Desktop\game\steamapps\common\Blender\blender.exe"
cd /d "%~dp0.."
"%BLENDER%" --background "blender\kshm2_scene.blend" --python "blender\render_video.py"
echo.
echo Done: blender\renders\KSHM2_reels.mp4
pause
