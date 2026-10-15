import "./globals.css";
export const metadata = {
  title: "SANEXT · Ваш опыт меняет маркетинг",
  description: "Какая маркетинговая поддержка нужна отделам продаж SANEXT",
  icons: { icon: "/sanext_logo.svg" },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
