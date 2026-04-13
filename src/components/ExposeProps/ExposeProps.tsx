import type { ReactElement } from "react";
import React, { useRef } from "react";

interface ExposePropsProps {
  ignoreProps?: string[];
  children: ReactElement | ReactElement[];
  className?: string;
  style?: React.CSSProperties;
}

const formatProps = (props: any, ignoreProps: string[]): React.ReactNode => {
  const filteredProps = Object.entries(props)
    .filter(([key]) => !ignoreProps.includes(key))
    .map(([key, value]: [string, any]) => {
      return (
        <span key={key}>
          <span>{`${key}="`}</span>
          <span className={"propValue"}>
            <span>{value.toString()}</span>
          </span>
          &quot;
        </span>
      );
    });

  return (
    <>
      {filteredProps.reduce<React.ReactNode[]>(
        (acc, curr) => [...acc, " ", curr],
        [],
      )}
    </>
  );
};

export const ExposeProps = ({
  children,
  className = "",
  ignoreProps = [],
  ...props
}: ExposePropsProps) => {
  const { style: styleValue } = props;

  const ref = useRef<HTMLDivElement>(null);

  return (
    <div className={className} style={styleValue} ref={ref}>
      {React.Children.map(children, (child: any, index: number) => {
        const isSpan = child.type === "span";

        return (
          <div key={index}>
            {child}
            <div>
              <span>
                {!isSpan && "<"}
                {child.type.displayName || child.type.name}{" "}
                {formatProps(child.props, ignoreProps)}
                {!isSpan && "/>"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default ExposeProps;
