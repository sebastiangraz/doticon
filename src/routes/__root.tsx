import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import "../styles.css";
const RootDocument = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
};

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "doticon",
      },
    ],
    //import styles.css
    link: [
      {
        rel: "stylesheet",
        href: "/styles.css",
      },
    ],
  }),
  shellComponent: RootDocument,
});
