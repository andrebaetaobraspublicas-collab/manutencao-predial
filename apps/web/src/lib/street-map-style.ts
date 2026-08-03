import type { StyleSpecification } from 'maplibre-gl';

/**
 * Base raster simples e rotulada. Evita o estado em que apenas o fundo de um
 * estilo vetorial carrega, sem ruas ou nomes, quando fontes/glyphs externos
 * são bloqueados pelo provedor de hospedagem ou pelo navegador.
 */
export function streetMapStyle(): StyleSpecification {
  const tileUrl =
    process.env.NEXT_PUBLIC_MAP_TILE_URL ??
    'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  return {
    version: 8,
    sources: {
      openStreetMap: {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [{ id: 'openStreetMap', type: 'raster', source: 'openStreetMap' }],
  };
}
