import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet, StyleProp, ViewStyle } from 'react-native';
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

      // Custom car marker icon HTML (red car with pin) - simplified version
      const carMarkerHtml = '<div style="width:40px;height:40px;position:relative;"><svg width="40" height="40" viewBox="0 0 40 40"><path d="M20 2C15.26 2 11.4 5.86 11.4 10.6C11.4 12.92 12.69 15.19 14.87 17.37L20 22.5L25.13 17.37C27.31 15.19 28.6 12.92 28.6 10.6C28.6 5.86 24.74 2 20 2Z" fill="#F73E3E" stroke="#000" stroke-width="0.5"/><path d="M12 28L28 28L28 32L12 32Z" fill="#F73E3E" stroke="#000" stroke-width="0.5"/><path d="M10 26L30 26L30 28L10 28Z" fill="#F73E3E" stroke="#000" stroke-width="0.5"/><circle cx="15" cy="30" r="2" fill="#2F4859"/><circle cx="25" cy="30" r="2" fill="#2F4859"/></svg></div>';

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
            var carMarkerHtml = ${JSON.stringify(carMarkerHtml)};
            markersData.forEach(function(markerData) {
              var marker = L.marker([markerData.lat, markerData.lng], {
                icon: L.divIcon({
                  className: 'custom-marker',
                  html: carMarkerHtml,
                  iconSize: [40, 40],
                  iconAnchor: [markerData.anchor.x * 40, markerData.anchor.y * 40],
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

