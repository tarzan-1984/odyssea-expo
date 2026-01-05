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
}

export interface OSMMapViewRef {
  animateToRegion: (region: Region, duration?: number) => void;
}

const OSMMapView = forwardRef<OSMMapViewRef, OSMMapViewProps>(
  ({ initialRegion, style, markers = [] }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const mapReadyRef = useRef(false);

    const updateMarkers = (markersToAdd: MarkerData[]) => {
      if (!mapReadyRef.current) return;

      const markersData = markersToAdd.map((marker) => ({
        lat: marker.coordinate.latitude,
        lng: marker.coordinate.longitude,
        anchor: marker.anchor || { x: 0.5, y: 0.5 },
      }));

      // Custom location pin marker icon: red teardrop with dark blue outline and light pink center
      const locationMarkerHtml = '<div style="width:34px;height:46px;position:relative;"><svg width="34" height="46" viewBox="0 0 92.25 122.88"><path d="M49.1,122.34a2.75,2.75,0,0,1-3.12.1A109.7,109.7,0,0,1,19,98.35C9.15,86,3,72.33.83,59.16-1.33,45.79.69,32.94,7.34,22.49A45.14,45.14,0,0,1,17.39,11.35C26.77,3.87,37.49-.08,48.16,0c10.29.08,20.43,3.92,29.2,11.91a43,43,0,0,1,7.79,9.49c7.15,11.77,8.69,26.8,5.55,42a92.52,92.52,0,0,1-41.6,58.92Zm-3-98.58a23,23,0,1,1-22.94,23A23,23,0,0,1,46.13,23.76Z" fill="#ef4136" stroke="#1E3A5F" stroke-width="2" fill-rule="evenodd"/><circle cx="46.13" cy="46.76" r="12" fill="#F5D5D5" stroke="#1E3A5F" stroke-width="1.5"/></svg></div>';

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
            var locationMarkerHtml = ${JSON.stringify(locationMarkerHtml)};
            markersData.forEach(function(markerData) {
              var marker = L.marker([markerData.lat, markerData.lng], {
                icon: L.divIcon({
                  className: 'custom-marker',
                  html: locationMarkerHtml,
                  iconSize: [34, 46],
                  iconAnchor: [markerData.anchor.x * 34, markerData.anchor.y * 46],
                })
              }).addTo(window.map);
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
      if (mapReadyRef.current && markers.length > 0) {
        updateMarkers(markers);
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

