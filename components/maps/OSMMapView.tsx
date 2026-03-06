import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle, Linking } from 'react-native';
import { WebView } from 'react-native-webview';

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
  driverStatus?: string | null;
  driverId?: string;
  driverExternalId?: string | null;
  status?: string | null;
}

export interface OSMMapViewProps {
  initialRegion: Region;
  style?: StyleProp<ViewStyle>;
  markers?: MarkerData[];
  showsUserLocation?: boolean;
  showsMyLocationButton?: boolean;
  scrollEnabled?: boolean;
  zoomEnabled?: boolean;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  showsCompass?: boolean;
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
  ({ initialRegion, style, markers = [], onMapPress, onMarkerPress }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const mapReadyRef = useRef(false);
    const currentZoomRef = useRef<number | null>(null);

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

    const updateMarkers = (markersToAdd: MarkerData[], zoom?: number) => {
      if (!mapReadyRef.current) return;

      // Use provided zoom or current zoom from ref
      const currentZoom = zoom ?? currentZoomRef.current ?? MAX_ZOOM;
      const { width, height } = calculateMarkerSize(currentZoom);

      const markersData = markersToAdd.map((marker) => ({
        lat: marker.coordinate.latitude,
        lng: marker.coordinate.longitude,
        anchor: marker.anchor || { x: 0.5, y: 0.5 },
        status: marker.driverStatus || null,
        statusColor: getStatusColor(marker.driverStatus),
        driverId: marker.driverId,
        driverExternalId: marker.driverExternalId,
        userStatus: marker.status || null,
      }));

      const scaleX = width / MAX_MARKER_WIDTH;
      const scaleY = height / MAX_MARKER_HEIGHT;

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
            
            markersData.forEach(function(markerData) {
              // Create marker SVG with status color
              var statusColor = markerData.statusColor || '#808080';
              var locationMarkerHtml = '<div style="position:relative;"><svg width="34" height="46" viewBox="0 0 92.25 122.88"><path d="' + markerSvgPath + '" fill="' + statusColor + '" stroke="#1E3A5F" stroke-width="2" fill-rule="evenodd"/><circle cx="46.13" cy="46.76" r="12" fill="#F5D5D5" stroke="#1E3A5F" stroke-width="1.5"/></svg></div>';
              
              var marker = L.marker([markerData.lat, markerData.lng], {
                icon: L.divIcon({
                  className: 'custom-marker',
                  html: '<div style="transform: scale(' + scaleX + ', ' + scaleY + '); transform-origin: top left; width: 34px; height: 46px;">' + locationMarkerHtml + '</div>',
                  iconSize: [markerWidth, markerHeight],
                  iconAnchor: [markerData.anchor.x * markerWidth, markerData.anchor.y * markerHeight],
                })
              });
              
              // Store driver data on marker for later use
              marker._driverStatus = markerData.status;
              marker._driverId = markerData.driverId;
              marker._driverExternalId = markerData.driverExternalId;
              marker._driverLat = markerData.lat;
              marker._driverLng = markerData.lng;
              
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

    // Update markers when markers prop changes
    useEffect(() => {
      if (mapReadyRef.current) {
        // Always update markers, even if array is empty (to clear map)
        updateMarkers(markers, currentZoomRef.current ?? undefined);
      }
    }, [markers]);

    useImperativeHandle(ref, () => ({
      animateToRegion: (region: Region, duration: number = 1000) => {
        webViewRef.current?.injectJavaScript(`
          (function() {
            if (window.map) {
              var center = [${region.latitude}, ${region.longitude}];
              var zoom = Math.min(
                Math.log2(360 / ${region.longitudeDelta}),
                18
              );
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

    const htmlContent = `
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
      zoomControl: true,
      scrollWheelZoom: true,
      doubleClickZoom: true,
      boxZoom: true,
      keyboard: true,
      dragging: true,
      touchZoom: true,
      zoomAnimation: true,
      fadeAnimation: true,
      markerZoomAnimation: true
    });

    // Add OpenStreetMap tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      tileSize: 256,
      zoomOffset: 0
    }).addTo(map);

    // Store map and markers in window for access from React Native
    window.map = map;
    window.markers = [];

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
      
      // Update marker sizes when zoom changes
      if (window.markers && window.markers.length > 0) {
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
    `;

    return (
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          source={{ html: htmlContent }}
          style={styles.webview}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
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
                if (markers.length > 0) {
                  updateMarkers(markers);
                }
              } else if (data.type === 'zoomChange') {
                // Update zoom ref when zoom changes
                currentZoomRef.current = data.zoom;
                // Markers are updated automatically in the zoomend handler
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

