const {
	AndroidConfig,
	withAndroidManifest,
} = require('@expo/config-plugins');

/**
 * Adds Android Foreground Service for react-native-background-actions (chat uploads).
 */
function withChatUploadBackgroundActions(config) {
	config = AndroidConfig.Permissions.withPermissions(config, [
		'android.permission.FOREGROUND_SERVICE',
		'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
		'android.permission.WAKE_LOCK',
	]);

	return withAndroidManifest(config, (config) => {
		const manifest = config.modResults;
		const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
		if (!app.service) {
			app.service = [];
		}

		const serviceName = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';
		const existing = app.service.find(
			(s) => s.$?.['android:name'] === serviceName,
		);

		if (existing) {
			existing.$['android:foregroundServiceType'] = 'dataSync';
			existing.$['android:exported'] = 'false';
		} else {
			app.service.push({
				$: {
					'android:name': serviceName,
					'android:foregroundServiceType': 'dataSync',
					'android:exported': 'false',
				},
			});
		}

		return config;
	});
}

module.exports = withChatUploadBackgroundActions;
