import * as THREE from 'three'
import { Text } from 'troika-three-text'
import * as UTILS from './utils.js'

export const map = {}
export const poiLabels = []

const TEXT_COLOR = new THREE.Color(0xed225d)
const MAP_COLOR = new THREE.Color(0x81efff)

const TEXT_FONT = "./static/Orbitron-VariableFont_wght.ttf"

// support for GeoJSON generated by http://geojson.io/
// only Point and Polygon are supported

const GEOJSON_GEOMETRY_TYPE_POLYGON = "Polygon"
const GEOJSON_GEOMETRY_TYPE_POINT = "Point"

export const POI_KEY_DEFAULT_ORIGIN = "default origin"
export const POI_KEY_CURRENT_LNG_LAT = "current lng/lat"

export function init(scene, json, overrideOrigin = false) {

  const mapGroup = new THREE.Group()

  const refPointMaterial = new THREE.PointsMaterial({ size: 0.5, color: 0xff00ff })

  const poiVertices = []

  const poi = []

  poi[POI_KEY_DEFAULT_ORIGIN] = {
    longitude: process.env.DEFAULT_ORIGIN_LONGITUDE,
    latitude: process.env.DEFAULT_ORIGIN_LATITUDE
  }

  poi[POI_KEY_CURRENT_LNG_LAT] = {
    longitude: 0,
    latitude: 0
  }

  let originId = POI_KEY_DEFAULT_ORIGIN

  if (overrideOrigin) {
    poi[POI_KEY_CURRENT_LNG_LAT].longitude = UTILS.origin.longitude
    poi[POI_KEY_CURRENT_LNG_LAT].latitude = UTILS.origin.latitude
    originId = POI_KEY_CURRENT_LNG_LAT
  } else {

    //
    // must find origin for this map first
    //
    let originFound = false


    for (const feature of json["features"]) {
      if ("origin" in feature["properties"]) {
        const lngLat = feature["geometry"]["coordinates"]
        UTILS.initOrigin(lngLat)
        console.log(`[ origin: ${lngLat} ]`)
        originId = feature["properties"]["id"]
        originFound = true
        break
      }
    }

    if (!originFound) {
      UTILS.initOrigin([
        poi[POI_KEY_DEFAULT_ORIGIN].longitude,
        poi[POI_KEY_DEFAULT_ORIGIN].latitude,
      ])
    }
  }

  for (const feature of json["features"]) {
    switch (feature["geometry"]["type"]) {
      case GEOJSON_GEOMETRY_TYPE_POLYGON: {
        const points = feature["geometry"]["coordinates"][0].map(coord => {
          const [x, y] = UTILS.getXY(coord)
          return new THREE.Vector2(x * UTILS.SCALE, y * UTILS.SCALE)
        })
        const shape = new THREE.Shape(points)
        const geometry = new THREE.ShapeGeometry(shape)
        geometry.rotateX(Math.PI / 2)
        const edges = new THREE.EdgesGeometry(geometry)
        const lineSegments = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
          color: MAP_COLOR,
          linewidth: 2
        }))
        mapGroup.add(lineSegments)
      }
        break;
      case GEOJSON_GEOMETRY_TYPE_POINT: {
        const coord = feature["geometry"]["coordinates"]

        const poiId = feature["properties"]["id"]
        poi[poiId] = {
          id: poiId,
          longitude: coord[0],
          latitude: coord[1]
        }

        const [x, y] = UTILS.getXY(coord)
        const vector3 = new THREE.Vector3(x * UTILS.SCALE, 0, y * UTILS.SCALE)
        poiVertices.push(vector3)

        const label = new Text()
        label.text = feature["properties"]["id"]
        label.fontSize = 1
        label.anchorX = 'center'
        label.color = new THREE.Color(TEXT_COLOR)
        label.font = TEXT_FONT

        label.position.x = x * UTILS.SCALE
        label.position.y = 2
        label.position.z = y * UTILS.SCALE

        poiLabels.push(label)
        mapGroup.add(label)
      }
        break;
    }
  }

  const poiGeometry = new THREE.BufferGeometry().setFromPoints(poiVertices)
  const poiMesh = new THREE.Points(poiGeometry, refPointMaterial)
  mapGroup.add(poiMesh)

  scene.add(mapGroup)

  return {
    mapGroup,
    originId,
    poi
  }
}

