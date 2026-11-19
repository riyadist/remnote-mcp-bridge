export const MYDRIVE_PLUGIN_VERSION = '0.1.50';
export const MYDRIVE_POPUP_WIDGET = 'mydrive_popup';
export const MYDRIVE_FILE_CARD_WIDGET = 'mydrive_file_card';
export const MYDRIVE_COMMAND_ID = 'mydrive_upload';
export const MYDRIVE_FILE_POWERUP_CODE = 'mydrive_file';
export const MYDRIVE_FILE_NAME_SLOT = 'fileName';
export const MYDRIVE_FILE_URL_SLOT = 'driveUrl';
export const MYDRIVE_FILE_GROUP_SLOT = 'fileGroup';
export const MYDRIVE_FILE_MIME_SLOT = 'mimeType';
export const MYDRIVE_FILE_ID_SLOT = 'fileId';
// Pazar yeri paketinde kişisel klasör kimliği yok: kullanıcı MyDrive penceresinde girer (yerel dev-2
// derlemesi boşsa local-defaults.json değerini bir kez yazar, bkz. features/local-defaults.ts).
export const MYDRIVE_DEFAULT_FOLDER_ID = '';
export const MYDRIVE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const MYDRIVE_CLIENT_ID_STORAGE_KEY = 'mydrive_google_client_id';
export const MYDRIVE_CLIENT_SECRET_STORAGE_KEY = 'mydrive_google_client_secret';
export const MYDRIVE_FOLDER_ID_STORAGE_KEY = 'mydrive_folder_id';
export const MYDRIVE_LAST_TARGET_STORAGE_KEY = 'mydrive_last_editor_target';
// Birleşik eklenti (2026-11-19): eklenti artık 8083'ten yüklenmiyor. OAuth başlatma/sonuç/oturum
// uçları ve Google'a kayıtlı yönlendirme adresi (http://localhost:8083/oauth2/callback) yerel MyDrive
// sunucusunda kaldığı için sunucu kökeni sabit yazılır. Sunucu kapalıysa MyDrive çalışmaz.
export const MYDRIVE_SERVER_ORIGIN = 'http://localhost:8083';
