// Screen preferences and drawings are also validated at the parent-window boundary.
export function screenPreferences(value = {}) {
  return {opacity: Math.max(10, Math.min(100, Number(value?.opacity) || 65)), autoHide: value?.autoHide !== false};
}
export function validateDrawing(value) {
  if (!Array.isArray(value) || value.length > 200) throw Error('Máximo de 200 traços por música e saída.');
  let count = 0;
  return value.map(stroke => {
    if (!stroke || !['pen', 'eraser'].includes(stroke.tool) || !/^#[0-9a-f]{6}$/i.test(stroke.color) || !Number.isFinite(stroke.width) || stroke.width < .001 || stroke.width > .1 || !Array.isArray(stroke.points) || !stroke.points.length || stroke.points.length > 2000) throw Error('Traço inválido.');
    count += stroke.points.length;
    if (count > 30000) throw Error('Desenho demasiado grande; apaga alguns traços.');
    return {tool:stroke.tool, color:stroke.color, width:stroke.width, points:stroke.points.map(point => {
      if (!Array.isArray(point) || point.length !== 2 || !point.every(n => Number.isFinite(n) && n >= 0 && n <= 1)) throw Error('Coordenada inválida.');
      return [...point];
    })};
  });
}
