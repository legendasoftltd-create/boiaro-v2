import { Navigate, useLocation } from "react-router-dom";

/** Redirects legacy /writer/*, /publisher/*, /narrator/* to /creator/* */
export default function RedirectToCreator() {
  const { pathname } = useLocation();
  // Extract sub-path after the role prefix
  const sub = pathname.replace(/^\/(writer|publisher|narrator)\/?/, "");
  const target = sub ? `/creator/${sub}` : "/creator";
  return <Navigate to={target} replace />;
}
