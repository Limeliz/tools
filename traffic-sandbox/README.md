# Traffic Sandbox

A small browser traffic simulation: cars drive around a town grid with junctions, traffic lights,
roundabouts and 30/50 km/h zones. No build step and no dependencies.

**Run it:** open `index.html` in a browser (double-click works), or serve the folder, e.g.
`python3 -m http.server` and open <http://localhost:8000/>.

## What you can do

| Tool | Click on | Effect |
| --- | --- | --- |
| Inspect | a car | Shows its speed, the limit, the speed it wants and what it is doing. Drag to pan. |
| Remove car | a car | Removes it. |
| Add defensive / aggressive | a road | Places a car there. `+5` buttons add cars at random places. |
| Junction | a crossing | Plain junction without lights: give way to traffic from the right. |
| Traffic lights | a crossing | Signal-controlled junction (needs 3 or more roads). |
| Roundabout | a crossing | Roundabout. Entering cars give way to cars on the ring. |
| Add/remove road | a road segment | Removes it, or builds it again (dashed lines). Dead ends get a turning circle. |
| Limit 30 / Limit 50 | a road segment | Sets its speed limit. 30 zones have an amber edge; signs show where the limit changes. |

Scroll to zoom, drag to pan, `Space` pauses. The simulation speed can be set from 0.5× to 8×.

## Drivers

Car following uses the Intelligent Driver Model (IDM). The two driver types use different settings:

| | Defensive | Aggressive |
| --- | --- | --- |
| Target speed | the limit | limit + 10 km/h |
| Time gap to car ahead | 1.8 s | 0.8 s |
| Min. gap when stopped | 3 m | 1.5 m |
| Acceleration | 1.2 m/s² | 2.8 m/s² |
| Comfortable braking | 1.6 m/s² | 3.8 m/s² |
| Planning ahead | looks 260 m ahead and slows at 0.9 m/s², so it is already at the lower limit 10 m before it starts | looks 120 m ahead and brakes hard at the last moment |
| Curves | slow (low sideways acceleration) | faster |
| Gap accepted at junctions | 5 s | 2.6 s |
| Yellow light | stops unless it would need to brake harder than 4 m/s² | drives through unless it can stop at 2.2 m/s² |

## How the simulation works

- `js/sim.js` builds a lane graph from the grid: one lane per direction on each road segment, plus
  connector lanes through junctions and entry, ring and exit lanes for roundabouts. Traffic drives on the right.
- Each car has a route of lanes that is extended at random as it drives. It avoids crowded roads and finds
  another way if its exit stays blocked.
- A junction is entered only after the car has *committed* to it. A car commits at the last point where it
  could still stop, and only if no conflicting car is in the junction, the lights allow it, the road after the
  junction has room, and no car with right of way is close. Cars therefore don't block the junction.
- `js/render.js` draws the scene on a canvas, and `js/main.js` connects the UI.
