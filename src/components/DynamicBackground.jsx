export default function DynamicBackground({ lowPower = false }) {
  return (
    <div className={`dynamic-bg pcb-bg ${lowPower ? "is-low-power" : ""}`} aria-hidden>
      <div className="pcb-base" />
      <div className="pcb-trace-layer trace-layer-a" />
      <div className="pcb-trace-layer trace-layer-b" />
      <div className="pcb-via-layer" />
    </div>
  );
}
