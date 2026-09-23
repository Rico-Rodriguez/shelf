import { useEffect, useState } from "react";
import { api } from "../src/api";
import { money } from "../src/format";
import { Back, Loading, Note, Row, Screen } from "../src/ui";

type Holding = {
  institutionValueCents: number;
  security: { name?: string; ticker?: string; type?: string } | null;
  account: { name?: string } | null;
};

export default function InvestmentsScreen() {
  const [rows, setRows] = useState<Holding[]>([]);
  const [total, setTotal] = useState(0);
  const [contribution, setContribution] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<{ holdings: Holding[]; totalCents?: number; contributionCents?: number }>("/api/investments")
      .then((res) => {
        setRows(res.holdings);
        setTotal(res.totalCents ?? res.holdings.reduce((sum, row) => sum + row.institutionValueCents, 0));
        setContribution(res.contributionCents ?? 0);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load investments"));
  }, []);

  return (
    <Screen title="Investments" refresh={<Back />}>
      {error ? <Note>{error}</Note> : null}
      {!rows.length && !error ? <Loading /> : null}
      <Row title="Value" detail={money(total)} />
      <Row title="Contributions" detail={money(contribution)} />
      {rows.map((row, index) => (
        <Row
          key={index}
          title={row.security?.name || row.security?.ticker || "Holding"}
          detail={`${money(row.institutionValueCents)}${row.account?.name ? ` · ${row.account.name}` : ""}`}
        />
      ))}
    </Screen>
  );
}
