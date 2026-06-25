export default function DynamicBackground({ lowPower = false }) {
  return <div className={`dynamic-bg pcb-bg ${lowPower ? "is-low-power" : ""}`} aria-hidden />;
}
