import React, { useRef, useEffect, useImperativeHandle, forwardRef, useMemo, useState } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import {
  getCartoVoyagerTileConfig,
  getLeafletRasterTileConfig,
  isMapTilerConfigured,
} from '@/utils/mapTileLayer';
import { loadMapMarkerImageUris, type MapMarkerImageUris } from '@/utils/mapMarkerAssets';

export interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

export interface MarkerData {
  coordinate: {
    latitude: number;
    longitude: number;
  };
  anchor?: { x: number; y: number };
  kind?: 'driver' | 'pickup' | 'delivery' | 'history' | 'liveDriver';
  label?: string;
  historyIndex?: number;
  markerColor?: string;
  isLastHistoryPoint?: boolean;
  tooltipType?: string;
  tooltipAddress?: string;
  tooltipTime?: string;
  driverStatus?: string | null;
  driverId?: string;
  driverExternalId?: string | null;
  status?: string | null;
}

export interface MapPolylineData {
  coordinates: Array<{ latitude: number; longitude: number }>;
  color?: string;
  weight?: number;
  opacity?: number;
}

export interface OSMMapViewProps {
  initialRegion: Region;
  style?: StyleProp<ViewStyle>;
  markers?: MarkerData[];
  polylineCoordinates?: Array<{ latitude: number; longitude: number }>;
  polylines?: MapPolylineData[];
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  showsCompass?: boolean;
  /** MapTiler when key is set; only enable on load detail (default: free CARTO). */
  useMapTilerBasemap?: boolean;
  onMapPress?: (latitude: number, longitude: number) => void;
  onMarkerPress?: (driverData: {
    id: string;
    externalId: string | null;
    driverStatus: string | null;
    latitude: number;
    longitude: number;
    status?: string | null;
  }) => void;
}

export interface OSMMapViewRef {
  animateToRegion: (region: Region, duration?: number) => void;
}

const OSMMapView = forwardRef<OSMMapViewRef, OSMMapViewProps>(
  ({
    initialRegion,
    style,
    markers = [],
    polylineCoordinates,
    polylines = [],
    onMapPress,
    onMarkerPress,
    scrollEnabled = true,
    zoomEnabled = true,
    useMapTilerBasemap = false,
  }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const mapReadyRef = useRef(false);
    const currentZoomRef = useRef<number | null>(null);
    const [markerImageUris, setMarkerImageUris] = useState<MapMarkerImageUris | null>(null);

    useEffect(() => {
      let cancelled = false;

      loadMapMarkerImageUris()
        .then((uris) => {
          if (!cancelled) {
            setMarkerImageUris(uris);
          }
        })
        .catch((error) => {
          console.warn('[OSMMapView] Failed to load marker images:', error);
        });

      return () => {
        cancelled = true;
      };
    }, []);

    // Marker size configuration
    const MIN_MARKER_WIDTH = 16;
    const MIN_MARKER_HEIGHT = 22;
    const MAX_MARKER_WIDTH = 34;
    const MAX_MARKER_HEIGHT = 46;
    const MIN_ZOOM = 0;
    const MAX_ZOOM = 18;

    const calculateMarkerSize = (zoom: number) => {
      // Clamp zoom between min and max
      const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom));
      
      // Calculate size based on zoom level (linear interpolation)
      const zoomRatio = (clampedZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
      const width = Math.round(MIN_MARKER_WIDTH + (MAX_MARKER_WIDTH - MIN_MARKER_WIDTH) * zoomRatio);
      const height = Math.round(MIN_MARKER_HEIGHT + (MAX_MARKER_HEIGHT - MIN_MARKER_HEIGHT) * zoomRatio);
      
      return { width, height };
    };

    const calculateHistoryMarkerSize = (zoom: number) => {
      const minZoom = 10;
      const maxZoom = 16;
      const maxDiameter = 20;
      const minDiameter = 12;
      const normalized = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
      return Math.round(maxDiameter - (maxDiameter - minDiameter) * normalized);
    };

    const calculateStopMarkerSize = (zoom: number) => {
      const minZoom = 4;
      const maxZoom = 12;
      const minWidth = 24;
      const maxWidth = 36;
      const normalized = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
      const width = Math.round(minWidth + (maxWidth - minWidth) * normalized);
      return { width, height: Math.round(width * 1.48) };
    };

    const calculateLiveDriverMarkerSize = (zoom: number) => {
      const minZoom = 4;
      const maxZoom = 14;
      const minWidth = 30;
      const maxWidth = 44;
      const normalized = Math.max(0, Math.min(1, (zoom - minZoom) / (maxZoom - minZoom)));
      const width = Math.round(minWidth + (maxWidth - minWidth) * normalized);
      return { width, height: Math.round(width * 1.48) };
    };

    // Driver status color mapping
    const getStatusColor = (status: string | null | undefined): string => {
      const statusColors: Record<string, string> = {
        'available': '#00d200',
        'available_on': '#cefece',
        'loaded_enroute': '#cefece',
        'available_off': '#e06665',
        'banned': '#ffb261',
        'no_interview': '#d60000',
        'expired_documents': '#d60000',
        'blocked': '#d60000',
        'on_vocation': '#ffb4d3',
        'on_hold': '#b2b2b2',
        'need_update': '#f1cfcf',
        'no_updates': '#ff3939',
        'unknown': '#808080'
      };
      
      if (!status) return '#808080'; // default gray for null/undefined
      return statusColors[status.toLowerCase()] || '#808080';
    };

    // Base SVG path for marker (will be colored based on status)
    const markerSvgPath = 'M49.1,122.34a2.75,2.75,0,0,1-3.12.1A109.7,109.7,0,0,1,19,98.35C9.15,86,3,72.33.83,59.16-1.33,45.79.69,32.94,7.34,22.49A45.14,45.14,0,0,1,17.39,11.35C26.77,3.87,37.49-.08,48.16,0c10.29.08,20.43,3.92,29.2,11.91a43,43,0,0,1,7.79,9.49c7.15,11.77,8.69,26.8,5.55,42a92.52,92.52,0,0,1-41.6,58.92Zm-3-98.58a23,23,0,1,1-22.94,23A23,23,0,0,1,46.13,23.76Z';

    const updateMarkers = (markersToAdd: MarkerData[], zoom?: number, imageUris?: MapMarkerImageUris | null) => {
      if (!mapReadyRef.current || !imageUris) return;

      // Use provided zoom or current zoom from ref
      const currentZoom = zoom ?? currentZoomRef.current ?? MAX_ZOOM;
      const { width, height } = calculateMarkerSize(currentZoom);

      const markersData = markersToAdd.map((marker) => ({
        lat: marker.coordinate.latitude,
        lng: marker.coordinate.longitude,
        anchor: marker.anchor || { x: 0.5, y: 0.5 },
        kind: marker.kind || 'driver',
        label: marker.label || '',
        historyIndex: typeof marker.historyIndex === 'number' ? marker.historyIndex : null,
        markerColor: marker.markerColor || null,
        isLastHistoryPoint: marker.isLastHistoryPoint === true,
        tooltipType: marker.tooltipType || '',
        tooltipAddress: marker.tooltipAddress || '',
        tooltipTime: marker.tooltipTime || '',
        status: marker.driverStatus || null,
        statusColor: getStatusColor(marker.driverStatus),
        driverId: marker.driverId,
        driverExternalId: marker.driverExternalId,
        userStatus: marker.status || null,
      }));

      const scaleX = width / MAX_MARKER_WIDTH;
      const scaleY = height / MAX_MARKER_HEIGHT;
      const historyDiameter = calculateHistoryMarkerSize(currentZoom);
      const stopSize = calculateStopMarkerSize(currentZoom);
      const liveDriverSize = calculateLiveDriverMarkerSize(currentZoom);

      const script = `
        (function() {
          if (window.map && window.markers) {
            // Remove existing markers
            window.markers.forEach(function(marker) {
              marker.remove();
            });
            window.markers = [];
            
            // Add new markers
            var markersData = ${JSON.stringify(markersData)};
            var markerSvgPath = ${JSON.stringify(markerSvgPath)};
            var scaleX = ${scaleX};
            var scaleY = ${scaleY};
            var markerWidth = ${width};
            var markerHeight = ${height};
            var historyDiameter = ${historyDiameter};
            var stopWidth = ${stopSize.width};
            var stopHeight = ${stopSize.height};
            var liveDriverWidth = ${liveDriverSize.width};
            var liveDriverHeight = ${liveDriverSize.height};
            var driverMarkerUri = ${JSON.stringify(imageUris.driver)};
            var pickupMarkerUri = ${JSON.stringify(imageUris.pickup)};
            var deliveryMarkerUri = ${JSON.stringify(imageUris.delivery)};

            function escapeHtml(value) {
              return String(value || '').replace(/[&<>"']/g, function(ch) {
                return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
              });
            }

            function createStopMarkerHtml(markerData) {
              var isDelivery = markerData.kind === 'delivery';
              var imageUri = isDelivery ? deliveryMarkerUri : pickupMarkerUri;
              return '<div style="width:' + stopWidth + 'px;height:' + stopHeight + 'px;display:flex;align-items:center;justify-content:center;">'
                + '<img src="' + imageUri + '" style="width:' + stopWidth + 'px;height:' + stopHeight + 'px;object-fit:contain;display:block;" />'
                + '</div>';
            }

            function createHistoryMarkerHtml(markerData) {
              var diameter = historyDiameter;
              var color = markerData.isLastHistoryPoint ? '#16A34A' : '#2563EB';
              var border = markerData.isLastHistoryPoint ? '#15803D' : '#1D4ED8';
              var fontSize = Math.max(8, Math.min(11, Math.round(diameter * 0.45)));
              return '<div style="width:' + Math.ceil(diameter * 1.55) + 'px;height:' + Math.ceil(diameter * 1.55) + 'px;display:flex;align-items:center;justify-content:center;overflow:visible;">'
                + '<div style="width:' + diameter + 'px;height:' + diameter + 'px;background:' + color + ';border:2px solid ' + border + ';border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 0 0 1px rgba(37,99,235,.25),0 1px 4px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;overflow:visible;">'
                + '<span style="display:block;transform:rotate(45deg);color:#fff;font-size:' + fontSize + 'px;font-family:Arial,sans-serif;font-weight:800;line-height:1;text-shadow:0 1px 1px rgba(0,0,0,.35);">' + escapeHtml(markerData.label) + '</span>'
                + '</div></div>';
            }

            function createLiveDriverMarkerHtml() {
              return '<div style="width:' + liveDriverWidth + 'px;height:' + liveDriverHeight + 'px;display:flex;align-items:center;justify-content:center;">'
                + '<img src="' + driverMarkerUri + '" style="width:' + liveDriverWidth + 'px;height:' + liveDriverHeight + 'px;object-fit:contain;display:block;" />'
                + '</div>';
            }
            
            markersData.forEach(function(markerData) {
              var markerHtml;
              var iconWidth = markerWidth;
              var iconHeight = markerHeight;
              var anchorX = markerData.anchor.x;
              var anchorY = markerData.anchor.y;

              if (markerData.kind === 'liveDriver') {
                markerHtml = createLiveDriverMarkerHtml();
                iconWidth = liveDriverWidth;
                iconHeight = liveDriverHeight;
                anchorX = 0.5;
                anchorY = 0.96;
              } else if (markerData.kind === 'pickup' || markerData.kind === 'delivery') {
                markerHtml = createStopMarkerHtml(markerData);
                iconWidth = stopWidth;
                iconHeight = stopHeight;
                anchorX = 0.5;
                anchorY = 0.96;
              } else if (markerData.kind === 'history') {
                markerHtml = createHistoryMarkerHtml(markerData);
                iconWidth = Math.ceil(historyDiameter * 1.55);
                iconHeight = Math.ceil(historyDiameter * 1.55);
                anchorX = 0.5;
                anchorY = 0.78;
              } else {
                // Create marker SVG with status color
                var statusColor = markerData.statusColor || '#808080';
                var locationMarkerHtml = '<div style="position:relative;"><svg width="34" height="46" viewBox="0 0 92.25 122.88"><path d="' + markerSvgPath + '" fill="' + statusColor + '" stroke="#1E3A5F" stroke-width="2" fill-rule="evenodd"/><circle cx="46.13" cy="46.76" r="12" fill="#F5D5D5" stroke="#1E3A5F" stroke-width="1.5"/></svg></div>';
                markerHtml = '<div style="transform: scale(' + scaleX + ', ' + scaleY + '); transform-origin: top left; width: 34px; height: 46px;">' + locationMarkerHtml + '</div>';
              }
              
              var historyZIndex = markerData.kind === 'history'
                ? 500 + (typeof markerData.historyIndex === 'number' ? markerData.historyIndex : 0)
                : 500;
              var marker = L.marker([markerData.lat, markerData.lng], {
                zIndexOffset: markerData.kind === 'liveDriver' ? 1000 : (markerData.kind === 'history' ? historyZIndex : 500),
                riseOnHover: markerData.kind === 'history',
                icon: L.divIcon({
                  className: 'custom-marker',
                  html: markerHtml,
                  iconSize: [iconWidth, iconHeight],
                  iconAnchor: [anchorX * iconWidth, anchorY * iconHeight],
                })
              });
              
              // Store driver data on marker for later use
              marker._driverStatus = markerData.status;
              marker._driverId = markerData.driverId;
              marker._driverExternalId = markerData.driverExternalId;
              marker._driverLat = markerData.lat;
              marker._driverLng = markerData.lng;

              if (markerData.tooltipType || markerData.tooltipAddress || markerData.tooltipTime) {
                marker.bindPopup(
                  '<div style="font-family:Arial,sans-serif;font-size:12px;line-height:1.35;max-width:220px;">'
                  + (markerData.tooltipType ? '<div style="font-weight:700;margin-bottom:2px;">' + escapeHtml(markerData.tooltipType) + '</div>' : '')
                  + (markerData.tooltipAddress ? '<div>' + escapeHtml(markerData.tooltipAddress) + '</div>' : '')
                  + (markerData.tooltipTime ? '<div style="color:#6B7280;margin-top:2px;">' + escapeHtml(markerData.tooltipTime) + '</div>' : '')
                  + '</div>'
                );
              }
              
              // Add click handler
              marker.on('click', function() {
                if (window.ReactNativeWebView && markerData.driverId) {
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'markerClick',
                    driverId: markerData.driverId,
                    externalId: markerData.driverExternalId || null,
                    driverStatus: markerData.status || null,
                    latitude: markerData.lat,
                    longitude: markerData.lng,
                    userStatus: markerData.userStatus || null,
                  }));
                }
              });
              
              marker.addTo(window.map);
              window.markers.push(marker);
            });
          }
        })();
        true;
      `;

      webViewRef.current?.injectJavaScript(script);
    };

    const updatePolylines = (basePolyline?: Array<{ latitude: number; longitude: number }>, extraPolylines: MapPolylineData[] = []) => {
      if (!mapReadyRef.current) return;

      const lines: MapPolylineData[] = [];
      if (Array.isArray(basePolyline) && basePolyline.length > 1) {
        lines.push({
          coordinates: basePolyline,
          color: '#2563EB',
          weight: 4,
          opacity: 0.75,
        });
      }
      lines.push(
        ...extraPolylines.filter((line) => Array.isArray(line.coordinates) && line.coordinates.length > 1)
      );

      const script = `
        (function() {
          if (!window.map) return true;
          if (window.polylines) {
            window.polylines.forEach(function(line) { line.remove(); });
          }
          window.polylines = [];
          var lines = ${JSON.stringify(lines)};
          lines.forEach(function(line) {
            var latLngs = (line.coordinates || []).map(function(point) {
              return [point.latitude, point.longitude];
            });
            if (latLngs.length < 2) return;
            var polyline = L.polyline(latLngs, {
              color: line.color || '#2563EB',
              weight: line.weight || 4,
              opacity: line.opacity == null ? 0.75 : line.opacity,
              interactive: false
            }).addTo(window.map);
            window.polylines.push(polyline);
          });
          return true;
        })();
        true;
      `;

      webViewRef.current?.injectJavaScript(script);
    };

    // Update markers when markers prop or image URIs change
    useEffect(() => {
      if (mapReadyRef.current) {
        // Always update markers, even if array is empty (to clear map)
        updateMarkers(markers, currentZoomRef.current ?? undefined, markerImageUris);
      }
    }, [markers, markerImageUris]);

    useEffect(() => {
      if (mapReadyRef.current) {
        updatePolylines(polylineCoordinates, polylines);
      }
    }, [polylineCoordinates, polylines]);

    const rasterTile = getLeafletRasterTileConfig({ useMapTiler: useMapTilerBasemap });
    const cartoTile = getCartoVoyagerTileConfig();
    const useMapTilerWithFallback = useMapTilerBasemap && isMapTilerConfigured();
    const tileLayerSubdomainsJs = rasterTile.subdomains
      ? `subdomains: '${rasterTile.subdomains}',`
      : '';
    const cartoTileSubdomainsJs = cartoTile.subdomains
      ? `subdomains: '${cartoTile.subdomains}',`
      : '';
    const draggingJs = scrollEnabled ? 'true' : 'false';
    const zoomJs = zoomEnabled ? 'true' : 'false';

    useImperativeHandle(ref, () => ({
      animateToRegion: (region: Region, duration: number = 1000) => {
        webViewRef.current?.injectJavaScript(`
          (function() {
            if (window.map) {
              var center = [${region.latitude}, ${region.longitude}];
              // Preserve user-selected zoom if available; otherwise derive from delta.
              var derivedZoom = Math.min(
                Math.log2(360 / ${region.longitudeDelta}),
                18
              );
              var currentZoom =
                (typeof window.currentZoom === 'number' && !isNaN(window.currentZoom))
                  ? window.currentZoom
                  : (window.map && typeof window.map.getZoom === 'function' ? window.map.getZoom() : null);
              var zoom = (typeof currentZoom === 'number' && !isNaN(currentZoom)) ? currentZoom : derivedZoom;
              window.map.setView(center, zoom, {
                animate: true,
                duration: ${duration / 1000}
              });
            }
          })();
          true;
        `);
      },
    }));

    const htmlContent = useMemo(
      () => `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body, html {
      width: 100%;
      height: 100%;
      overflow: hidden;
    }
    #map {
      width: 100%;
      height: 100%;
    }
    /* Attribution bar hidden per product UI; tile provider terms may require credit elsewhere. */
    .leaflet-control-attribution {
      display: none !important;
    }
    .custom-marker {
      background: transparent !important;
      border: none !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    // Initialize map
    const map = L.map('map', {
      center: [${initialRegion.latitude}, ${initialRegion.longitude}],
      zoom: Math.min(
        Math.log2(360 / ${initialRegion.longitudeDelta}),
        18
      ),
      attributionControl: false,
      zoomControl: false,
      scrollWheelZoom: ${zoomJs},
      doubleClickZoom: ${zoomJs},
      boxZoom: ${zoomJs},
      keyboard: ${zoomJs},
      dragging: ${draggingJs},
      touchZoom: ${zoomJs},
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true
    });

    // MapTiler when key is set; on repeated tile errors (quota/403) fall back to CARTO Voyager
    ${
      useMapTilerWithFallback
        ? `
    (function() {
      var activeTileLayer = L.tileLayer(${JSON.stringify(rasterTile.url)}, {
        attribution: '',
        ${tileLayerSubdomainsJs}
        maxZoom: ${rasterTile.maxZoom},
        tileSize: 256,
        zoomOffset: 0
      });
      var tileErrorCount = 0;
      var tileErrorTimer = null;
      activeTileLayer.on('tileerror', function() {
        tileErrorCount += 1;
        if (!tileErrorTimer) {
          tileErrorTimer = setTimeout(function() {
            tileErrorCount = 0;
            tileErrorTimer = null;
          }, 2500);
        }
        if (tileErrorCount >= 5) {
          if (tileErrorTimer) {
            clearTimeout(tileErrorTimer);
            tileErrorTimer = null;
          }
          tileErrorCount = 0;
          map.removeLayer(activeTileLayer);
          activeTileLayer = L.tileLayer(${JSON.stringify(cartoTile.url)}, {
            attribution: '',
            ${cartoTileSubdomainsJs}
            maxZoom: ${cartoTile.maxZoom},
            tileSize: 256,
            zoomOffset: 0
          }).addTo(map);
        }
      });
      activeTileLayer.addTo(map);
    })();
    `
        : `
    L.tileLayer(${JSON.stringify(rasterTile.url)}, {
      attribution: '',
      ${tileLayerSubdomainsJs}
      maxZoom: ${rasterTile.maxZoom},
      tileSize: 256,
      zoomOffset: 0
    }).addTo(map);
    `
    }

    // Store map and markers in window for access from React Native
    window.map = map;
    window.markers = [];
    window.polylines = [];

    // Handle map ready
    map.whenReady(function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapReady'
        }));
      }
    });

    // Handle map move events
    map.on('moveend', function() {
      const center = map.getCenter();
      const bounds = map.getBounds();
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'regionChange',
          region: {
            latitude: center.lat,
            longitude: center.lng,
            latitudeDelta: ne.lat - sw.lat,
            longitudeDelta: ne.lng - sw.lng
          }
        }));
      }
    });

    // Handle zoom events to update marker sizes
    map.on('zoomend', function() {
      const zoom = map.getZoom();
      window.currentZoom = zoom;
      
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'zoomChange',
          zoom: zoom
        }));
      }
      
      // Marker sizes are recalculated from React Native via updateMarkers().
      if (false && window.markers && window.markers.length > 0) {
        var minZoom = ${MIN_ZOOM};
        var maxZoom = ${MAX_ZOOM};
        var minWidth = ${MIN_MARKER_WIDTH};
        var minHeight = ${MIN_MARKER_HEIGHT};
        var maxWidth = ${MAX_MARKER_WIDTH};
        var maxHeight = ${MAX_MARKER_HEIGHT};
        
        var clampedZoom = Math.max(minZoom, Math.min(maxZoom, zoom));
        var zoomRatio = (clampedZoom - minZoom) / (maxZoom - minZoom);
        var width = Math.round(minWidth + (maxWidth - minWidth) * zoomRatio);
        var height = Math.round(minHeight + (maxHeight - minHeight) * zoomRatio);
        
        var scaleX = width / maxWidth;
        var scaleY = height / maxHeight;
        
        var markerSvgPath = 'M49.1,122.34a2.75,2.75,0,0,1-3.12.1A109.7,109.7,0,0,1,19,98.35C9.15,86,3,72.33.83,59.16-1.33,45.79.69,32.94,7.34,22.49A45.14,45.14,0,0,1,17.39,11.35C26.77,3.87,37.49-.08,48.16,0c10.29.08,20.43,3.92,29.2,11.91a43,43,0,0,1,7.79,9.49c7.15,11.77,8.69,26.8,5.55,42a92.52,92.52,0,0,1-41.6,58.92Zm-3-98.58a23,23,0,1,1-22.94,23A23,23,0,0,1,46.13,23.76Z';
        
        // Status color mapping
        var statusColors = {
          'available': '#00d200',
          'available_on': '#cefece',
          'loaded_enroute': '#cefece',
          'available_off': '#e06665',
          'banned': '#ffb261',
          'no_interview': '#d60000',
          'expired_documents': '#d60000',
          'blocked': '#d60000',
          'on_vocation': '#ffb4d3',
          'on_hold': '#b2b2b2',
          'need_update': '#f1cfcf',
          'no_updates': '#ff3939',
          'unknown': '#808080'
        };
        
        function getStatusColor(status) {
          if (!status) return '#808080';
          return statusColors[status.toLowerCase()] || '#808080';
        }
        
        window.markers.forEach(function(marker) {
          var anchor = marker.options.icon ? marker.options.icon.options.iconAnchor : [maxWidth * 0.5, maxHeight * 0.5];
          var anchorX = anchor[0] / maxWidth;
          var anchorY = anchor[1] / maxHeight;
          
          // Get status from marker data (stored when marker was created)
          var markerStatus = marker._driverStatus || null;
          var statusColor = getStatusColor(markerStatus);
          
          var locationMarkerSvg = '<svg width="34" height="46" viewBox="0 0 92.25 122.88"><path d="' + markerSvgPath + '" fill="' + statusColor + '" stroke="#1E3A5F" stroke-width="2" fill-rule="evenodd"/><circle cx="46.13" cy="46.76" r="12" fill="#F5D5D5" stroke="#1E3A5F" stroke-width="1.5"/></svg>';
          
          var newIcon = L.divIcon({
            className: 'custom-marker',
            html: '<div style="transform: scale(' + scaleX + ', ' + scaleY + '); transform-origin: top left; width: 34px; height: 46px; position: relative;">' + locationMarkerSvg + '</div>',
            iconSize: [width, height],
            iconAnchor: [anchorX * width, anchorY * height],
          });
          
          marker.setIcon(newIcon);
        });
      }
    });
    
    // Store initial zoom
    window.currentZoom = map.getZoom();

    // Map click handler (for placing marker / getting coordinates)
    map.on('click', function(e) {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'mapClick',
          lat: e.latlng.lat,
          lng: e.latlng.lng
        }));
      }
    });
  </script>
</body>
</html>
    `,
      [
        cartoTile.maxZoom,
        cartoTile.url,
        cartoTileSubdomainsJs,
        draggingJs,
        initialRegion.latitude,
        initialRegion.longitude,
        initialRegion.longitudeDelta,
        rasterTile.maxZoom,
        rasterTile.url,
        tileLayerSubdomainsJs,
        useMapTilerWithFallback,
        zoomJs,
      ]
    );

    const webViewSource = useMemo(() => ({ html: htmlContent }), [htmlContent]);

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          source={webViewSource}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          scalesPageToFit={true}
          // Prevent navigation to external sites (Leaflet / OpenStreetMap links)
          // so that the map is not replaced by a web page or open a browser
          // when tapping on attribution or logos inside the map.
          onShouldStartLoadWithRequest={(request) => {
            const url = request?.url || '';

            // Allow loading of embedded HTML (about:blank, data:, etc.)
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
              return true;
            }

            // Block any external http/https navigation completely.
            // We no longer open external browser windows from the map.
            return false;
          }}
          onMessage={(event) => {
            try {
              const data = JSON.parse(event.nativeEvent.data);
              if (data.type === 'mapReady') {
                mapReadyRef.current = true;
                updatePolylines(polylineCoordinates, polylines);
                if (markers.length > 0) {
                  updateMarkers(markers, undefined, markerImageUris);
                }
              } else if (data.type === 'zoomChange') {
                // Update zoom ref when zoom changes
                currentZoomRef.current = data.zoom;
                updateMarkers(markers, data.zoom, markerImageUris);
              } else if (data.type === 'mapClick' && onMapPress) {
                onMapPress(data.lat, data.lng);
              } else if (data.type === 'markerClick' && onMarkerPress) {
                // Handle marker click
                onMarkerPress({
                  id: data.driverId,
                  externalId: data.externalId,
                  driverStatus: data.driverStatus,
                  latitude: data.latitude,
                  longitude: data.longitude,
                  status: data.userStatus || null,
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }}
        />
      </View>
    );
  }
);

OSMMapView.displayName = 'OSMMapView';

// Marker component for compatibility with react-native-maps API
// Note: In OSMMapView, markers are passed via the `markers` prop, not as children
export const Marker = ({ coordinate, anchor, children }: { coordinate: { latitude: number; longitude: number }; anchor?: { x: number; y: number }; children?: React.ReactNode }) => {
  // This is a placeholder component for compatibility
  // Actual markers should be passed via OSMMapView's `markers` prop
  return null;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default OSMMapView;
