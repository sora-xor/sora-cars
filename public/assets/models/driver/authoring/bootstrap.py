import bpy, addon_utils, os, sys, json, importlib
ROOT = os.path.abspath(os.environ.get('SORA_DRIVER_TOOLING', os.path.dirname(__file__)))
MODULE = 'bl_ext.sora_driver.mpfb'
repo = bpy.context.preferences.extensions.repos.get('SORA driver tooling')
if repo is None:
    repo = bpy.context.preferences.extensions.repos.new(name='SORA driver tooling', module='sora_driver', custom_directory=os.path.join(ROOT, 'extensions'))
repo.use_sync_on_startup = False
# Set the extension's documented user-data preference before registration,
# including its early logger, so every generated file stays task-local.
mpfb = importlib.import_module(MODULE)
preferences_module = importlib.import_module(MODULE + '._preferences')
preferences_module.MpfbPreferences.__annotations__['mpfb_user_data'] = bpy.props.StringProperty(
    name='Path to MPFB user data', default=os.path.join(ROOT, 'mpfb-user'))
os.makedirs(os.path.join(ROOT, 'mpfb-user'), exist_ok=True)
def fail(error):
    raise error
addon_utils.enable(MODULE, default_set=True, persistent=True, handle_error=fail)
mpfb = importlib.import_module(MODULE)
services = importlib.import_module(MODULE + '.services')
prefs = bpy.context.preferences.addons[MODULE].preferences
prefs.mpfb_second_root = os.path.join(ROOT, 'assets')
services.LocationService.update_second_root()
print('MPFB_READY', mpfb.VERSION, services.LocationService.get_user_home(), services.LocationService.get_second_root())
if __name__ == '__main__':
    human = services.HumanService.create_human()
    print('BODY_READY', human.name, len(human.data.vertices))
