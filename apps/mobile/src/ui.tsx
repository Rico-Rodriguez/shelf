import { router } from "expo-router";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, MerchantMark } from "./icons";

export const colors = {
  bg: "#f3f5f7",
  card: "#ffffff",
  ink: "#1c1f24",
  muted: "#5c6570",
  line: "#e4e7eb",
  positive: "#1f7a4d",
  danger: "#9b3b3b",
  accent: "#1c1f24",
};

export function Back() {
  return (
    <Pressable onPress={() => router.back()} hitSlop={8}>
      <Text style={styles.back}>Back</Text>
    </Pressable>
  );
}

export function Screen({
  title,
  subtitle,
  children,
  footer,
  refresh,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  refresh?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["top", "left", "right"]}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {refresh}
        </View>
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  secureTextEntry?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "email-address" | "number-pad";
  multiline?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize="none"
        style={[styles.input, multiline ? styles.multiline : null]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export function Button({
  label,
  onPress,
  busy,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  tone?: "primary" | "quiet" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={[styles.button, tone === "quiet" && styles.quiet, tone === "danger" && styles.danger]}
    >
      {busy ? <ActivityIndicator color={tone === "primary" ? "#fff" : colors.ink} /> : <Text style={[styles.buttonText, tone !== "primary" && styles.quietText]}>{label}</Text>}
    </Pressable>
  );
}

export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {action && onAction ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={styles.sectionAction}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function LedgerRow({
  name,
  meta,
  amount,
  color,
  onPress,
}: {
  name: string;
  meta?: string;
  amount: string;
  color?: string | null;
  onPress?: () => void;
}) {
  const body = (
    <View style={styles.ledger}>
      <MerchantMark name={name} color={color} />
      <View style={styles.ledgerCopy}>
        <Text numberOfLines={1} style={styles.rowTitle}>{name}</Text>
        {meta ? <Text numberOfLines={1} style={styles.meta}>{meta}</Text> : null}
      </View>
      <Text style={styles.amount}>{amount}</Text>
    </View>
  );
  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

export function Row({ title, detail, icon, onPress }: { title: string; detail?: string; icon?: string; onPress?: () => void }) {
  const body = (
    <View style={styles.row}>
      {icon ? <Icon name={icon} size={18} color={colors.ink} /> : null}
      <Text style={styles.rowTitle}>{title}</Text>
      {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
    </View>
  );
  if (!onPress) return body;
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

export function Note({ children }: { children: string }) {
  return <Text style={styles.note}>{children}</Text>;
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator />
      <Text style={styles.note}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 20, paddingBottom: 40, gap: 12 },
  header: { flexDirection: "row", alignItems: "flex-end", gap: 12, marginBottom: 8 },
  back: { color: colors.ink, fontSize: 16, paddingBottom: 6 },
  title: { fontSize: 32, fontWeight: "600", color: colors.ink },
  subtitle: { marginTop: 4, fontSize: 15, color: colors.muted },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 16, gap: 8 },
  field: { gap: 6 },
  label: { fontSize: 13, color: colors.muted },
  input: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 120, textAlignVertical: "top" },
  button: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  quiet: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: "#f8ecec" },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  quietText: { color: colors.ink },
  row: {
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  section: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 8 },
  sectionTitle: { fontSize: 13, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", color: colors.muted },
  sectionAction: { fontSize: 15, color: colors.ink },
  ledger: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  ledgerCopy: { flex: 1, gap: 2 },
  meta: { fontSize: 12, color: colors.muted },
  amount: { fontSize: 15, fontWeight: "600", color: colors.ink },
  rowTitle: { flex: 1, fontSize: 16, color: colors.ink },
  rowDetail: { fontSize: 15, color: colors.muted },
  note: { color: colors.muted, fontSize: 14 },
  loading: { paddingVertical: 24, alignItems: "center", gap: 8 },
});
