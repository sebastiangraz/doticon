import {
  Link,
  Outlet,
  createFileRoute,
  useRouterState,
} from "@tanstack/react-router";
import { Shader } from "#/components/Shader/Shader";
import styles from "../index.module.css";

const ShellLayout = () => {
  const guidelinesActive = useRouterState({
    select: (s) => s.location.pathname === "/guidelines",
  });

  return (
    <>
      <div className={styles.container}>
        <div className={styles.navigation}>
          <svg
            width="24"
            viewBox="0 0 140 140"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            id="logo"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M13.098 5.67312C25.0098 3.26184 37.1906 1.59277 49.5906 0.716196C50.9941 1.26145 52.5251 1.90677 54.1789 2.67049C65.0282 7.67985 81.2359 17.8098 101.712 38.2864C122.189 58.7629 132.319 74.9706 137.328 85.82C138.092 87.4748 138.738 89.0061 139.284 90.4107C138.407 102.81 136.738 114.991 134.327 126.902L13.098 5.67312ZM133.022 6.99757C137.503 26.8743 139.909 47.5369 140 68.746C133.532 58.2634 123.795 45.5191 109.137 30.8616C94.4804 16.2046 81.7368 6.46761 71.2546 0C92.4633 0.0913534 113.126 2.49717 133.002 6.978V6.99757H133.022ZM0.716267 49.5891C1.59287 37.1898 3.26195 25.0094 5.67308 13.098L126.902 134.327C114.99 136.738 102.809 138.407 90.4094 139.284C89.0055 138.738 87.4749 138.093 85.8208 137.329C74.9718 132.32 58.7641 122.19 38.2876 101.713C17.8108 81.2369 7.68083 65.0292 2.67147 54.1802C1.90736 52.5253 1.26173 50.9937 0.716267 49.5891ZM68.7454 140C58.2632 133.532 45.5196 123.795 30.8624 109.138C16.2049 94.4807 6.46761 81.7363 0 71.2542C0.0912834 92.4632 2.49713 113.126 6.978 133.002H6.99757V133.022C26.874 137.503 47.5363 139.909 68.7454 140Z"
              fill="currentColor"
            />
          </svg>
          <div className={styles.controls}>
            <div className={styles.themeToggle}>
              <input
                className={styles.themeToggleInput}
                id="theme-mode-toggle"
                type="checkbox"
              />
              <label
                className={styles.themeToggleButton}
                htmlFor="theme-mode-toggle"
                aria-label="Toggle dark mode"
                title="Toggle dark mode"
              >
                <svg
                  className={styles.themeToggleMoon}
                  width="100%"
                  height="auto"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M10 7C10 10.866 13.134 14 17 14C18.9584 14 20.729 13.1957 21.9995 11.8995C22 11.933 22 11.9665 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C12.0335 2 12.067 2 12.1005 2.00049C10.8043 3.27098 10 5.04157 10 7ZM4 12C4 16.4183 7.58172 20 12 20C15.0583 20 17.7158 18.2839 19.062 15.7621C18.3945 15.9187 17.7035 16 17 16C12.0294 16 8 11.9706 8 7C8 6.29648 8.08133 5.60547 8.2379 4.938C5.71611 6.28423 4 8.9417 4 12Z"
                    fill="currentColor"
                  />
                </svg>
                <svg
                  className={styles.themeToggleSun}
                  width="100%"
                  height="auto"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M12 18C8.68629 18 6 15.3137 6 12C6 8.68629 8.68629 6 12 6C15.3137 6 18 8.68629 18 12C18 15.3137 15.3137 18 12 18ZM12 16C14.2091 16 16 14.2091 16 12C16 9.79086 14.2091 8 12 8C9.79086 8 8 9.79086 8 12C8 14.2091 9.79086 16 12 16ZM11 1H13V4H11V1ZM11 20H13V23H11V20ZM3.51472 4.92893L4.92893 3.51472L7.05025 5.63604L5.63604 7.05025L3.51472 4.92893ZM16.9497 18.364L18.364 16.9497L20.4853 19.0711L19.0711 20.4853L16.9497 18.364ZM19.0711 3.51472L20.4853 4.92893L18.364 7.05025L16.9497 5.63604L19.0711 3.51472ZM5.63604 16.9497L7.05025 18.364L4.92893 20.4853L3.51472 19.0711L5.63604 16.9497ZM23 11V13H20V11H23ZM4 11V13H1V11H4Z"
                    fill="currentColor"
                  />
                </svg>
              </label>
            </div>
            <div
              className={styles.toggle}
              data-active={guidelinesActive ? "true" : "false"}
            >
              <Link
                to={guidelinesActive ? "/" : "/guidelines"}
                className={styles.toggleButton}
                aria-current={guidelinesActive ? "page" : undefined}
                aria-label={
                  guidelinesActive
                    ? "Leave guidelines, return to playground"
                    : "Open guidelines"
                }
              >
                {guidelinesActive ? "← Playground" : "Guidelines"}
              </Link>
            </div>
          </div>
        </div>
        <Outlet />
        <p className={styles.copyright}>
          © STACKS {new Date().getFullYear()} &middot; All rights reserved
        </p>
      </div>
      <Shader color={"#1E91AF"} color2={"#F7ED2C"} />
    </>
  );
};

export const Route = createFileRoute("/_shell")({
  component: ShellLayout,
});
