import argparse
import geopandas as gpd
import glob
import json
import os
import requests
import warnings
from shapely.geometry import box, Polygon, MultiPolygon, LineString, MultiLineString
from osmtogeojson import osmtogeojson

OUTPUT_DIR = "../public/map-data"
os.makedirs(OUTPUT_DIR, exist_ok=True)

#
# Parse cli arguments
#

# Default distance from the origin used to build a bounding box to clip the map layers
# Adjust as needed for your area of interest
DEFAULT_ORIGIN_DISTANCE = 2.0

parser = argparse.ArgumentParser(description="Build map layers for an lat/lon origin and bounding box")
parser.add_argument("--origin-lat", type=float, default=None, help="Latitude of origin")
parser.add_argument("--origin-lon", type=float, default=None, help="Longitude of origin")
parser.add_argument("--origin-distance", type=float, default=DEFAULT_ORIGIN_DISTANCE, help="Distance from origin (in degrees) used to build bounding box")
parser.add_argument("--origin-left", type=float, default=None, help="Distance from origin and to the left (in degrees) used to build bounding box")
parser.add_argument("--origin-top", type=float, default=None, help="Distance from origin and to the top (in degrees) used to build bounding box")
parser.add_argument("--show-geopandas-warnings", type=bool, default=False, help="Show Geopandas warnings")
parser.add_argument("--build-110m-maps", type=bool, default=False, help="Build 110m maps instead of 10m maps")
parser.add_argument("--skip-aerodromes", type=bool, default=False, help="Skip building aerodrome layers and origins")

args = parser.parse_args()

#
# setup default origin latitude and longitude
#

origin_lat = os.environ.get("SKIES_ADSB_DEFAULT_ORIGIN_LATITUDE") or args.origin_lat
origin_lon = os.environ.get("SKIES_ADSB_DEFAULT_ORIGIN_LONGITUDE") or args.origin_lon

if origin_lat is not None and origin_lon is not None:
    ORIGIN_LAT = float(origin_lat)
    ORIGIN_LON = float(origin_lon)
else:
    print("Error: Default origin latitude and longitude not found.")
    parser.print_help()
    print()
    exit(1)



#
# By default suppress geopandas warnings
#
# Pass commandline argument --show-geopandas-warnings=true to show warnings
#
if not args.show_geopandas_warnings:
    warnings.filterwarnings("ignore")
    
ORIGIN_LEFT = None
ORIGIN_TOP = None

if args.origin_left is not None and args.origin_top is not None:
    ORIGIN_LEFT = args.origin_left
    ORIGIN_TOP = args.origin_top
else:
    ORIGIN_LEFT = args.origin_distance
    ORIGIN_TOP = args.origin_distance
    
ORIGIN_LEFT = abs(ORIGIN_LEFT)
ORIGIN_TOP = abs(ORIGIN_TOP)

# setup Bounding box for clipping
WEST = ORIGIN_LON - ORIGIN_LEFT
EAST = ORIGIN_LON + ORIGIN_LEFT
NORTH = ORIGIN_LAT + ORIGIN_TOP
SOUTH = ORIGIN_LAT - ORIGIN_TOP

print("############################################")
print(f"\nDefault Origin lat: {ORIGIN_LAT} lon: {ORIGIN_LON}")
print(f"Origin Left: {ORIGIN_LEFT} Top: {ORIGIN_TOP}")
print(f"Bounding box: ({WEST}, {NORTH}) to ({EAST}, {SOUTH})\n")
print("============================================")
#
# Convert any instances of Polygon and MultiPolygon to LineString or MultiLineString as needed
#
def convert_polygons_to_lines(geometry):
    if isinstance(geometry, (Polygon, MultiPolygon)):
        if isinstance(geometry, Polygon):
            return LineString(list(geometry.exterior.coords))
        else:
            lines = []
            for poly in geometry.geoms:
                lines.append(LineString(list(poly.exterior.coords)))
            return MultiLineString(lines)
    return geometry

#
# Clip a shapefile to a bounding box
#
def clip_shapefile_to_bounding_box(shape_file, bounding_box):
    try:
        gdf = gpd.read_file(shape_file)        
        bounds = box(*bounding_box)
        clipped_gdf = gdf.clip(bounds)
        clipped_gdf.geometry = clipped_gdf.geometry.apply(convert_polygons_to_lines)
        return clipped_gdf
    except FileNotFoundError:
        print(f"Error: shape file not found at {shape_file}")
        return None
    except Exception as e:
        print(f"An unexpected error occurred: {e}")
        return None

#
# Clean output directory first
#
def clean_output_directory():
    print(f"Cleaning output directory: {OUTPUT_DIR}")
    try:
        # Find and delete all .geojson and .json files
        for pattern in ['*.geojson', '*.json']:
            files = glob.glob(os.path.join(OUTPUT_DIR, pattern))
            for file in files:
                os.remove(file)
                print(f"Deleted: {file}")
    except Exception as e:
        print(f"Error cleaning directory {OUTPUT_DIR}: {e}")

print("############################################")
clean_output_directory()
print("============================================")

#
# Generate Natural Earth Layers
#

MAP_LAYERS_10M = [
    ("data/10m_cultural/10m_cultural/ne_10m_admin_1_states_provinces.shp", "states_provinces"),
    ("data/10m_cultural/10m_cultural/ne_10m_airports.shp", "airports"),    
    ("data/10m_cultural/10m_cultural/ne_10m_urban_areas.shp", "urban_areas"),
    ("data/10m_cultural/10m_cultural/ne_10m_admin_2_counties.shp", "counties"),
    ("data/10m_cultural/10m_cultural/ne_10m_roads.shp", "roads"),
    ("data/10m_physical/ne_10m_lakes.shp", "lakes"),
    ("data/10m_physical/ne_10m_rivers_lake_centerlines.shp", "rivers"),
]

MAP_LAYERS_110M = [
    ("data/110m_cultural/ne_110m_admin_1_states_provinces.shp", "states_provinces"),            
    ("data/110m_physical/ne_110m_lakes.shp", "lakes"),
    ("data/110m_physical/ne_110m_rivers_lake_centerlines.shp", "rivers"),
]

if args.build_110m_maps:
    MAP_LAYERS = MAP_LAYERS_110M
else:
    MAP_LAYERS = MAP_LAYERS_10M

print("############################################")
print("Generating Natural Earth Layers...")

if (args.build_110m_maps):
    print("\n\tBuilding 110m maps")
else:
    print("\n\tBuilding 10m maps")

print(f"\n\tClipping maps to bounding box ({WEST}, {NORTH}) to ({EAST}, {SOUTH})...")

for map_data, output_name, in MAP_LAYERS:
    print(f"\tClipping {map_data} to bounding box...")
    clipped_map = clip_shapefile_to_bounding_box(map_data, (WEST, NORTH, EAST, SOUTH))
    clipped_map.to_file(f"{OUTPUT_DIR}/{output_name}.geojson", driver="GeoJSON")

print("============================================")


#
# Generate FAA Airspace Layers
#

print("############################################")
print("Generating FAA Airspace Layers...\n")

AIRSPACE = [
    ("B", "airspace_class_b"),
    ("C", "airspace_class_c"),
    ("D", "airspace_class_d"),
]

clipped_airspace = clip_shapefile_to_bounding_box("data/Class_Airspace/Class_Airspace.shp", (WEST, NORTH, EAST, SOUTH))
clipped_airspace = clipped_airspace.to_crs("EPSG:4326")
for class_name, output_name in AIRSPACE:
    print(f"\tClipping Class {class_name} Airspace to bounding box...")
    airspace = clipped_airspace[clipped_airspace["CLASS"] == class_name]
    airspace.to_file(f"{OUTPUT_DIR}/{output_name}.geojson", driver="GeoJSON")

print("============================================")

#
# Generate Aerodrome and Runway Geometry Layers
#

print("############################################")
print("Generating OSM Aerodrome and Runway Geometry Layers...\n")

def generate_aerodrome_runway_geometry(osm_value, output_file_name):
    try:
        OVERPASS_URL = "https://overpass-api.de/api/interpreter"
        bounds = f"""{SOUTH},{WEST},{NORTH},{EAST}"""
        query = f"""
            [out:json][timeout:25];
            (    
            way["aeroway"="{osm_value}"]({bounds});
            relation["aeroway"="{osm_value}"]({bounds});
            );
            out body;
            >;
            out skel qt;
        """
        print(query)
        result = requests.get(OVERPASS_URL, params={"data": query})
        osm_json = osmtogeojson.process_osm_json(result.json())
        osm_json['name'] = osm_value
        with(open(f"{OUTPUT_DIR}/{output_file_name}", 'w')) as f:
            json.dump(osm_json, f, indent=4)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")


OVERPASS_QUERIES = [
    ("aerodrome", "aerodrome.geojson"),
    ("runway", "tmp_runway.geojson"),
]

for osm_value, output_file_name in OVERPASS_QUERIES:
    if not args.skip_aerodromes:
        print(f"\tRunning Overpass query for {osm_value}...")
        generate_aerodrome_runway_geometry(osm_value, output_file_name)
    else:
        print(f"\tSkipping Overpass query for {osm_value}...")
        with open(output_file_name, 'w') as f:
            json.dump({}, f)


print(f"\tMerge Aerodromes and Runways...")

tmp_runway_geojson = f"{OUTPUT_DIR}/{OVERPASS_QUERIES[1][1]}"

gdf_aerodromes = gpd.read_file(f"{OUTPUT_DIR}/{OVERPASS_QUERIES[0][1]}")
gdf_runways = gpd.read_file(tmp_runway_geojson)
merged_gdf = gpd.sjoin(gdf_runways, gdf_aerodromes, how='inner', predicate='within')
merged_gdf.to_file(f"{OUTPUT_DIR}/runway.geojson", driver="GeoJSON")

try:    
    os.remove(tmp_runway_geojson)
    print(f"Deleted: {tmp_runway_geojson}")
except Exception as e:
    print(f"Error cleaning directory {OUTPUT_DIR}: {e}")


print("============================================")

#
# Generate Aerodrome Origins as LAT/LON
#

print("############################################")
print("Fetching OSM Aerodrome Origins as LAT/LON...")

AERODROME_ORIGINS_FILENAME = f"{OUTPUT_DIR}/origins.json"

def get_aerodrome_origins_as_lat_lon():
    try:
        OVERPASS_URL = "https://overpass-api.de/api/interpreter"
        bounds = f"""{SOUTH},{WEST},{NORTH},{EAST}"""
        query = f"""
            [out:json][timeout:25];
            (    
            way["aeroway"="aerodrome"]({bounds});
            relation["aeroway"="aerodrome"]({bounds});
            );
            out center tags;
        """
        print(query)
        result = requests.get(OVERPASS_URL, params={"data": query})        
        with(open(AERODROME_ORIGINS_FILENAME, 'w')) as f:
            json.dump(result.json(), f, indent=4)
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if not args.skip_aerodromes:
    get_aerodrome_origins_as_lat_lon()
else:
    print(f"\tSkipping Overpass query for OSM Aerodrome Origins...")
    with open(AERODROME_ORIGINS_FILENAME, 'w') as f:
        json.dump({}, f)


print("============================================")
