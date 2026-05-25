import SensorDashboard from "@/views/SensorDashboard";

export default function DashboardPage({ lowPower = false, fluid = false }) {
  return <SensorDashboard lowPower={lowPower} fluid={fluid} />;
}
