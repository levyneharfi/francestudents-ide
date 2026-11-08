"use client";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  LabelList,
} from "recharts";
import type { ReplyBlock } from "../../../../packages/francestudent-client/src/replies";
export default function ReplyChart({
  block,
}: {
  block: Extract<ReplyBlock, { kind: "chart" }>;
}) {
  const common = (
    <>
      <CartesianGrid stroke="var(--border)" vertical={false} />
      <XAxis dataKey="label" stroke="var(--muted)" tick={{ fontSize: 12 }} />
      <YAxis stroke="var(--muted)" width={45} tick={{ fontSize: 12 }} />
    </>
  );
  return (
    <>
      <div className="reply-chart" aria-hidden="true">
        <ResponsiveContainer width="100%" height={240}>
          {block.chart === "bar" ? (
            <BarChart
              data={block.data}
              margin={{ top: 25, right: 20, left: 0, bottom: 0 }}
            >
              {common}
              <Bar
                dataKey="value"
                fill="var(--text)"
                radius={[3, 3, 0, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  fill="var(--text)"
                  fontSize={12}
                />
              </Bar>
            </BarChart>
          ) : (
            <LineChart
              data={block.data}
              margin={{ top: 25, right: 20, left: 0, bottom: 0 }}
            >
              {common}
              <Line
                dataKey="value"
                stroke="var(--text)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="value"
                  position="top"
                  fill="var(--text)"
                  fontSize={12}
                />
              </Line>
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <details>
        <summary>
          Données du graphique{block.unit ? ` (${block.unit})` : ""}
        </summary>
        <table>
          <thead>
            <tr>
              <th>Libellé</th>
              <th>Valeur</th>
            </tr>
          </thead>
          <tbody>
            {block.data.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                <td>
                  {d.value} {block.unit}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}
