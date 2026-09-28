import { LAYERS, type LayerId } from "@portfolio/shared";
import { T } from "./T";

export function LayerChips({ layers }: { layers: LayerId[] }) {
  return (
    <ul className="layer-chips">
      {layers.map((id) => {
        const layer = LAYERS.find((l) => l.id === id);
        return (
          <li key={id} data-layer={id}>
            {layer ? <T text={layer.label} /> : id}
          </li>
        );
      })}
    </ul>
  );
}
