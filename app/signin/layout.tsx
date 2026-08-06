import "../../public/plugins/fontawesome-free/css/all.min.css";

export default function SignInLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="hold-transition login-page">{children}</div>
    </>
  );
}
