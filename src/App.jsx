import { useEffect, useRef } from "react";

import Map from "ol/Map.js";
import View from "ol/View.js";
import { OSM, Vector as VectorSource } from "ol/source.js";
import { Tile as TileLayer, Vector as VectorLayer } from "ol/layer.js";
import { fromLonLat } from "ol/proj.js";
import * as turf from "@turf/turf"; //turf
import GeoJSON from "ol/format/GeoJSON.js";
//
import Draw from "ol/interaction/Draw.js";
import Overlay from "ol/Overlay.js";
import { Circle as CircleStyle, Fill, Stroke, Style } from "ol/style.js";
import { LineString, Polygon } from "ol/geom.js";
import { getArea, getLength } from "ol/sphere.js";
import { unByKey } from "ol/Observable.js";

function App() {
  const initialized = useRef(false);
  const source = new VectorSource();
  //draw

  useEffect(() => {
    const createBuffer = () => {
      const format = new GeoJSON();

      //

      let point = turf.point([50.688, 32.4279]);
      let buffered = turf.buffer(point, 100, { units: "kilometers" });

      // convert the generated point to a OpenLayers feature
      const marker = format.readFeature(buffered);
      marker.getGeometry().transform("EPSG:4326", "EPSG:3857");
      source.addFeature(marker);
    };

    // My actual effect logic...
    const vectorLayer = new VectorLayer({
      source: source,
    });

    const rasterLayer = new TileLayer({
      source: new OSM(),
    });

    const map = new Map({
      layers: [rasterLayer, vectorLayer],
      target: document.getElementById("map"),
      view: new View({
        center: fromLonLat([53.688, 32.4279]),
        zoom: 6,
      }),
    });
    createBuffer();

    //draw

    const vector = new VectorLayer({
      source: source,
      style: {
        "fill-color": "rgba(255, 255, 255, 0.2)",
        "stroke-color": "#ffcc33",
        "stroke-width": 2,
        "circle-radius": 7,
        "circle-fill-color": "#ffcc33",
      },
    });

    /**
     * Currently drawn feature.
     * @type {import("../src/ol/Feature.js").default}
     */
    let sketch;

    /**
     * The help tooltip element.
     * @type {HTMLElement}
     */
    let helpTooltipElement;

    /**
     * Overlay to show the help messages.
     * @type {Overlay}
     */
    let helpTooltip;

    /**
     * The measure tooltip element.
     * @type {HTMLElement}
     */
    let measureTooltipElement;

    /**
     * Overlay to show the measurement.
     * @type {Overlay}
     */
    let measureTooltip;

    /**
     * Message to show when the user is drawing a polygon.
     * @type {string}
     */
    const continuePolygonMsg = "Click to continue drawing the polygon";

    /**
     * Message to show when the user is drawing a line.
     * @type {string}
     */
    const continueLineMsg = "Click to continue drawing the line";

    /**
     * Handle pointer move.
     * @param {import("../src/ol/MapBrowserEvent").default} evt The event.
     */
    const pointerMoveHandler = function (evt) {
      if (evt.dragging) {
        return;
      }
      /** @type {string} */
      let helpMsg = "Click to start drawing";

      if (sketch) {
        const geom = sketch.getGeometry();
        if (geom instanceof Polygon) {
          helpMsg = continuePolygonMsg;
        } else if (geom instanceof LineString) {
          helpMsg = continueLineMsg;
        }
      }

      helpTooltipElement.innerHTML = helpMsg;
      helpTooltip.setPosition(evt.coordinate);

      helpTooltipElement.classList.remove("hidden");
    };

    map.on("pointermove", pointerMoveHandler);

    map.getViewport().addEventListener("mouseout", function () {
      helpTooltipElement.classList.add("hidden");
    });

    const typeSelect = document.getElementById("type");

    let draw; // global so we can remove it later

    /**
     * Format length output.
     * @param {LineString} line The line.
     * @return {string} The formatted length.
     */
    const formatLength = function (line) {
      const length = getLength(line);
      let output;
      if (length > 100) {
        output = Math.round((length / 1000) * 100) / 100 + " " + "km";
      } else {
        output = Math.round(length * 100) / 100 + " " + "m";
      }
      return output;
    };

    /**
     * Format area output.
     * @param {Polygon} polygon The polygon.
     * @return {string} Formatted area.
     */
    const formatArea = function (polygon) {
      const area = getArea(polygon);
      let output;
      if (area > 10000) {
        output =
          Math.round((area / 1000000) * 100) / 100 + " " + "km<sup>2</sup>";
      } else {
        output = Math.round(area * 100) / 100 + " " + "m<sup>2</sup>";
      }
      return output;
    };

    function addInteraction() {
      const type = typeSelect.value == "area" ? "Polygon" : "LineString";
      draw = new Draw({
        source: source,
        type: type,
        style: new Style({
          fill: new Fill({
            color: "rgba(255, 255, 255, 0.2)",
          }),
          stroke: new Stroke({
            color: "rgba(0, 0, 0, 0.5)",
            lineDash: [10, 10],
            width: 2,
          }),
          image: new CircleStyle({
            radius: 5,
            stroke: new Stroke({
              color: "rgba(0, 0, 0, 0.7)",
            }),
            fill: new Fill({
              color: "rgba(255, 255, 255, 0.2)",
            }),
          }),
        }),
      });
      map.addInteraction(draw);

      createMeasureTooltip();
      createHelpTooltip();

      let listener;
      draw.on("drawstart", function (evt) {
        // set sketch
        sketch = evt.feature;

        /** @type {import("../src/ol/coordinate.js").Coordinate|undefined} */
        let tooltipCoord = evt.coordinate;

        listener = sketch.getGeometry().on("change", function (evt) {
          const geom = evt.target;
          let output;
          if (geom instanceof Polygon) {
            output = formatArea(geom);
            tooltipCoord = geom.getInteriorPoint().getCoordinates();
          } else if (geom instanceof LineString) {
            output = formatLength(geom);
            tooltipCoord = geom.getLastCoordinate();
          }
          measureTooltipElement.innerHTML = output;
          measureTooltip.setPosition(tooltipCoord);
        });
      });

      draw.on("drawend", function () {
        measureTooltipElement.className = "ol-tooltip ol-tooltip-static";
        measureTooltip.setOffset([0, -7]);
        // unset sketch
        sketch = null;
        // unset tooltip so that a new one can be created
        measureTooltipElement = null;
        createMeasureTooltip();
        unByKey(listener);
      });
    }

    /**
     * Creates a new help tooltip
     */
    function createHelpTooltip() {
      if (helpTooltipElement) {
        helpTooltipElement.parentNode.removeChild(helpTooltipElement);
      }
      helpTooltipElement = document.createElement("div");
      helpTooltipElement.className = "ol-tooltip hidden";
      helpTooltip = new Overlay({
        element: helpTooltipElement,
        offset: [15, 0],
        positioning: "center-left",
      });
      map.addOverlay(helpTooltip);
    }

    /**
     * Creates a new measure tooltip
     */
    function createMeasureTooltip() {
      if (measureTooltipElement) {
        measureTooltipElement.parentNode.removeChild(measureTooltipElement);
      }
      measureTooltipElement = document.createElement("div");
      measureTooltipElement.className = "ol-tooltip ol-tooltip-measure";
      measureTooltip = new Overlay({
        element: measureTooltipElement,
        offset: [0, -15],
        positioning: "bottom-center",
        stopEvent: false,
        insertFirst: false,
      });
      map.addOverlay(measureTooltip);
    }

    /**
     * Let user change the geometry type.
     */

    typeSelect.onchange = function () {
      map.removeInteraction(draw);
      addInteraction();
    };

    addInteraction();
  }, []);

  return (
    <div className="app">
      <div id="map" className="map"></div>
      <form>
        <select id="type">
          <option value="length">Length (LineString)</option>
          <option value="area">Area (Polygon)</option>
        </select>
      </form>
      <button>Draw</button>
      {/* <button>Draw</button> */}
    </div>
  );
}

export default App;
