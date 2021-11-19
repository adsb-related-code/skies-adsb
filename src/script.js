import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import Stats from 'stats.js'
import { Text } from 'troika-three-text'
import * as MAPS from './maps.js'
import * as UTILS from './utils.js'
import { HUD } from './HUD.js'
import * as AIRCRAFT from './aircraft.js'
import * as ADSB from './ADSB.js'

const sofla_map = {}
const poiVertices = []
const poiLabels = []


let simulationPaused = false

const pointer = new THREE.Vector2()
pointer.x = undefined
pointer.y = undefined
const raycaster = new THREE.Raycaster()

const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(75, UTILS.sizes.width / UTILS.sizes.height, 0.1, 10000)
camera.position.z = 10
scene.add(camera)


// renderer
const canvas = document.querySelector('canvas.webgl')
const renderer = new THREE.WebGLRenderer({
  canvas: canvas
})
renderer.setSize(window.innerWidth, window.innerHeight)

// stats
const stats = new Stats()
stats.showPanel(0)
document.body.appendChild(stats.dom)



// controls
const controls = new OrbitControls(camera, renderer.domElement)
//
// track if mouse click causes camera changes via OrbitControls
// used to help toggle display of HUD and prevent the HUD
// from toggling while user pans the camera around using a mouse
// see:
// https://www.html5rocks.com/en/mobile/touchandmouse/
//
let isClickDueToOrbitControlsInteraction = false
controls.addEventListener('change', (event) => {
  isClickDueToOrbitControlsInteraction = true
  light.position.copy(camera.position)
  light.target.position.copy(controls.target)
})
controls.addEventListener('start', (event) => {
  if (isClickDueToOrbitControlsInteraction) {
    isClickDueToOrbitControlsInteraction = false
  }
})




// axes helper
const axesHelper = new THREE.AxesHelper()
scene.add(axesHelper)

// scene lighting
const amientLight = new THREE.AmbientLight(0x4c4c4c)
scene.add(amientLight)

const light = new THREE.DirectionalLight(0xffffff, 1)
light.position.copy(camera.position)
scene.add(light)
scene.add(light.target)




// MIA: 25.799740325918425, -80.28758238380416




navigator.geolocation.getCurrentPosition((pos) => {

  console.log(`ORIGIN lat: ${pos.coords.latitude} lng: ${pos.coords.longitude}`)

  UTILS.origin.lat = pos.coords.latitude
  UTILS.origin.lng = pos.coords.longitude

  initGroundPlaneBoundariesAndPOI()

}, (error) => {
  console.log("UNABLE TO GET GEOLOCATION | REASON -> " + error.message)
  UTILS.origin.lat = MAPS.mia_poi['HOME'][0]
  UTILS.origin.lng = MAPS.mia_poi['HOME'][1]
  console.log(`fallback location - HOME: ${MAPS.mia_poi['HOME']}`)

  initGroundPlaneBoundariesAndPOI()
})


function initGroundPlaneBoundariesAndPOI() {
  // TODO start websocket connection once geolocation has been updated
  // TODO update geometries once geolocation has been updated

  // const { x, y } = getXY(origin, { latitude: 25.799740325918425, longitude: -80.28758238380416 })
  // console.log(`mia: ${x} ${y}`)

  for (const key in MAPS.sofla_zones) {
    console.log(`loading ground plane for: ${key}`);
    const zone = MAPS.sofla_zones[key]
    sofla_map[key] = []
    let points = []
    for (let i = 0; i < zone.length; i += 2) {
      const { x, y } = UTILS.getXY(UTILS.origin, { lat: zone[i], lng: zone[i + 1] })
      points.push(new THREE.Vector2(x * UTILS.SCALE, y * UTILS.SCALE))
    }

    let shape = new THREE.Shape(points)
    let geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(Math.PI / 2)
    let edges = new THREE.EdgesGeometry(geometry)
    let lineSegments = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
      color: new THREE.Color('#81efff'),
      linewidth: 2
    }))
    scene.add(lineSegments)
  }


  // fill('#ED225D');
  // points of interest (poi)

  for (const key in MAPS.mia_poi) {
    const ref_pt = MAPS.mia_poi[key]
    console.log(`${key} -> ${ref_pt}`)
    const { x, y } = UTILS.getXY(UTILS.origin, { lat: ref_pt[0], lng: ref_pt[1] })
    poiVertices.push(new THREE.Vector3(x * UTILS.SCALE, 0, y * UTILS.SCALE))

    const label = new Text()
    label.text = key
    label.fontSize = 1
    label.anchorX = 'center'
    label.color = 0xED225D
    label.font = "./static/Orbitron-VariableFont_wght.ttf"

    label.position.x = x * UTILS.SCALE
    label.position.y = 2
    label.position.z = y * UTILS.SCALE

    poiLabels.push(label)
    scene.add(label)
  }
  const poiGeometry = new THREE.BufferGeometry().setFromPoints(poiVertices)

  const poiMesh = new THREE.Points(poiGeometry, UTILS.refPointMaterial)
  scene.add(poiMesh)
}


//const s = new WebSocket('wss://raspberrypi.local:30006');
const s = new WebSocket('ws://192.168.86.34:30006')
//const s = new WebSocket('wss://' + self.location.host + ':30006')
s.addEventListener('message', (event) => {

  if (simulationPaused) {
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    const result = reader.result

    // parse SBS data here...

    let data = result.split(",")
    let hexIdent = data[ADSB.HEX_IDENT]

    if (!(hexIdent in AIRCRAFT.aircrafts)) {
      const aircraft = new AIRCRAFT.Aircraft(scene)
      aircraft.hex = hexIdent
      AIRCRAFT.aircrafts[hexIdent] = aircraft
    }

    AIRCRAFT.aircrafts[hexIdent].update(data)

    //aircrafts[hexIdent].log()
  }
  reader.readAsText(event.data)
});



function draw(deltaTime) {

  raycaster.setFromCamera(pointer, camera)

  //
  // aircraft
  //

  for (const key in AIRCRAFT.aircrafts) {

    const ac = AIRCRAFT.aircrafts[key];
    ac.updateText(camera.position)

    if (pointer.x !== undefined && pointer.y !== undefined) {

      const groupIntersect = raycaster.intersectObject(ac.group, true)

      if (groupIntersect.length > 0) {

        console.log("---------------")
        console.log(`key: ${key}`)
        console.log(ac)
        console.log(groupIntersect)
        console.log(`hasValidTelemetry: ${ac.hasValidTelemetry()}`)
        console.log("---------------")
        pointer.x = undefined
        pointer.y = undefined

        if (ac.hasValidTelemetry() && key !== UTILS.INTERSECTED.key) {

          if (UTILS.INTERSECTED.key !== null) {
            UTILS.INTERSECTED.mesh.material.color = AIRCRAFT.airCraftColor
          }

          UTILS.INTERSECTED.key = key
          UTILS.INTERSECTED.mesh = ac.mesh
          UTILS.INTERSECTED.mesh.material.color = AIRCRAFT.airCraftSelectedColor

          UTILS._HUD.reset()
          UTILS._HUD.show()
          ac.fetchInfo()

          console.log(UTILS.INTERSECTED)
        }
      }
    }

    ac.ttl -= 100 * deltaTime
    if (ac.ttl < 0) {
      ac.clear(scene)
      delete AIRCRAFT.aircrafts[key]
    }
  }

  for (const poiLabel of poiLabels) {
    poiLabel.lookAt(camera.position)
  }

  if (pointer.x !== undefined && pointer.y !== undefined) {
    deselectAirCraftAndHideHUD()
    pointer.x = undefined
    pointer.y = undefined
  }
}

function deselectAirCraftAndHideHUD(animate = true) {
  if (UTILS.INTERSECTED.key !== null) {
    UTILS.INTERSECTED.mesh.material.color = AIRCRAFT.airCraftColor
    UTILS.INTERSECTED.key = null
    UTILS.INTERSECTED.mesh = null
    UTILS._HUD.hide(animate)
  }
}


// window resize event listeners
window.addEventListener('resize', () => {
  UTILS.sizes.width = window.innerWidth
  UTILS.sizes.height = window.innerHeight

  console.log(`window resize - w: ${UTILS.sizes.width} h: ${UTILS.sizes.height}`)

  camera.aspect = UTILS.sizes.width / UTILS.sizes.height
  camera.updateProjectionMatrix()
  renderer.setSize(UTILS.sizes.width, UTILS.sizes.height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  deselectAirCraftAndHideHUD({ animate: false })

  UTILS._HUD.toggleOrientation(UTILS.isLandscape())
})


// single click listener to check for airplane intersections
window.addEventListener('click', (event) => {
  if (event.pointerType === 'mouse' && isClickDueToOrbitControlsInteraction) {
    isClickDueToOrbitControlsInteraction = false
    return
  }
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
  pointer.y = - (event.clientY / window.innerHeight) * 2 + 1;
  console.log(`click`, pointer, event)
})

// fullscreen toggle on double click event listener
const fullscreenButton = document.getElementById("fullscreen_button")
console.log(fullscreenButton)
fullscreenButton.addEventListener('click', () => {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement

  if (!fullscreenElement) {
    if (document.body.requestFullscreen) {
      document.body.requestFullscreen()
    }
    else if (document.body.webkitRequestFullscreen) {
      document.body.webkitRequestFullscreen()
    }
  }
  else {
    if (document.exitFullscreen) {
      document.exitFullscreen()
    }
    else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen()
    }
  }
})

// handle page visibility
// https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API

function handleVisibilityChange() {
  if (document.visibilityState === "hidden") {
    console.log("pause simulation...")
    simulationPaused = true
  } else {
    console.log("start simulation...")
    simulationPaused = false
  }
}

document.addEventListener("visibilitychange", handleVisibilityChange, false);


//
// tick
//

// Clock
let clock = new THREE.Clock()

const tick = function () {
  stats.begin()

  const elapsedTime = clock.getElapsedTime()

  requestAnimationFrame(tick)

  controls.update()

  draw(clock.getDelta())

  renderer.render(scene, camera)

  stats.end()
}

tick()