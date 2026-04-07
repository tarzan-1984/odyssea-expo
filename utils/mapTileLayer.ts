/**
 * Raster basemap for Leaflet in WebView.
 * Prefer MapTiler (streets-v4) when EXPO_PUBLIC_MAPTILER_API_KEY is set;
 * otherwise CARTO Voyager (no key, avoids OSMF tile server blocks).
 */

const MAPTILER_STYLE = 'streets-v4';

export type LeafletRasterTileConfig = {
	url: string;
	attribution: string;
	/** Leaflet subdomains string e.g. 'abcd', or null when URL has no {s} */
	subdomains: string | null;
	maxZoom: number;
};

export function getLeafletRasterTileConfig(): LeafletRasterTileConfig {
	const key = process.env.EXPO_PUBLIC_MAPTILER_API_KEY?.trim() ?? '';
	if (key) {
		return {
			url: `https://api.maptiler.com/maps/${MAPTILER_STYLE}/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`,
			attribution:
				'&copy; <a href="https://www.maptiler.com/copyright/">MapTiler</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
			subdomains: null,
			maxZoom: 22,
		};
	}
	return {
		url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
		attribution:
			'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
		subdomains: 'abcd',
		maxZoom: 20,
	};
}
