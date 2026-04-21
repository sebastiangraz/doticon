import { useEffect, useMemo, useRef, useState } from "react";

const getRandomChar = () => {
  const chars = "XxOYyZzRTQ0#$%&*^_|+*";
  return chars[Math.floor(Math.random() * chars.length)];
};

const isIgnorableChar = (char: string) => {
  // Include space, newline, carriage return, and tab characters
  const ignorableChars = " \n\r\t";
  return ignorableChars.includes(char);
};

const isIgnorableWord = (word: string) => {
  return /^\s+$/.test(word);
};

interface ScrambleTextProps {
  text: string;
  inView?: boolean;
  maxCharDelay?: number;
  scrambleTimes?: number;
  scrambleInterval?: number;
  staggerDelay?: number;
  initialOpacity?: number;
}

export function ScrambleText({
  text,
  inView = true,
  maxCharDelay = 1200,
  scrambleTimes = 2,
  scrambleInterval = 130,
  staggerDelay = 12,
  initialOpacity = 0.3,
}: ScrambleTextProps) {
  const wordsArray = useMemo(() => {
    const initialText = text.split(/(\s+)/);

    return initialText.map((word, wordIndex) => ({
      word,
      key: wordIndex.toString(),
      isRevealed: false,
      chars: word.split("").map((char, charIndex) => ({
        char: isIgnorableChar(char) ? char : getRandomChar(), // Initialize to scrambled char or keep ignorable chars
        originalChar: char, // Store the original character
        isScrambled: !isIgnorableChar(char), // Start as scrambled if not ignorable
        isRevealed: false,
        key: `${wordIndex}-${charIndex}`,
      })),
    }));
  }, [text]);

  const [words, setWords] = useState(wordsArray);

  // Reset words when text changes
  useEffect(() => {
    setWords(wordsArray);
  }, [wordsArray]);

  // Ref to keep track of timeouts
  const timeoutsRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const isActiveRef = useRef(false);

  // Handle the scrambling effect
  useEffect(() => {
    isActiveRef.current = true;

    // Clear existing timeouts
    timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    timeoutsRef.current = [];

    if (!inView) {
      isActiveRef.current = false;
    } else {
      // Ensure the displayed text matches the latest input before scrambling.
      setWords(wordsArray);

      wordsArray.forEach((wordObj, wordIndex) => {
        if (isIgnorableWord(wordObj.word)) {
          if (!isActiveRef.current) return;
          // Mark the word as revealed immediately
          setWords((prevWords) =>
            prevWords.map((w, i) =>
              i === wordIndex ? { ...w, isRevealed: true } : w,
            ),
          );
          return;
        }

        const startDelay = wordIndex * staggerDelay;

        const scrambleWordTimeout = setTimeout(() => {
          if (!isActiveRef.current) return;

          // Keep track of how many characters have been revealed
          let revealedCharCount = 0;
          const totalChars = wordObj.chars.filter(
            (c) => !isIgnorableChar(c.originalChar),
          ).length;

          wordObj.chars.forEach((charObj, charIndex) => {
            if (isIgnorableChar(charObj.originalChar)) {
              if (!isActiveRef.current) return;
              // Ignore and consider it revealed
              revealedCharCount++;
              if (revealedCharCount === totalChars) {
                // All characters revealed, mark the word as revealed
                setWords((prevWords) =>
                  prevWords.map((w, i) =>
                    i === wordIndex ? { ...w, isRevealed: true } : w,
                  ),
                );
              }
              return;
            }

            const charStartDelay = Math.random() * maxCharDelay; // Random delay before starting to scramble

            const scrambleCharTimeout = setTimeout(() => {
              if (!isActiveRef.current) return;
              const scrambleChar = (count = 0) => {
                if (!isActiveRef.current) return;
                if (count >= scrambleTimes) {
                  // Reveal the actual character
                  setWords((prevWords) =>
                    prevWords.map((w, i) => {
                      if (i === wordIndex) {
                        const updatedChars = w.chars.map((c, idx) =>
                          idx === charIndex
                            ? {
                                ...c,
                                char: c.originalChar,
                                isScrambled: false,
                                isRevealed: true,
                              }
                            : c,
                        );
                        return { ...w, chars: updatedChars };
                      }
                      return w;
                    }),
                  );

                  revealedCharCount++;
                  if (revealedCharCount === totalChars) {
                    // All characters revealed, mark the word as revealed
                    setWords((prevWords) =>
                      prevWords.map((w, i) =>
                        i === wordIndex ? { ...w, isRevealed: true } : w,
                      ),
                    );
                  }
                  return;
                }

                // Continue scrambling
                setWords((prevWords) =>
                  prevWords.map((w, i) => {
                    if (i === wordIndex) {
                      const updatedChars = w.chars.map((c, idx) =>
                        idx === charIndex
                          ? {
                              ...c,
                              char: getRandomChar(),
                              isScrambled: true,
                              isRevealed: false,
                            }
                          : c,
                      );
                      return { ...w, chars: updatedChars };
                    }
                    return w;
                  }),
                );

                if (!isActiveRef.current) return;
                const timeout = setTimeout(
                  () => scrambleChar(count + 1),
                  scrambleInterval,
                );
                timeoutsRef.current.push(timeout);
              };

              scrambleChar();
            }, charStartDelay);

            timeoutsRef.current.push(scrambleCharTimeout);
          });
        }, startDelay);

        timeoutsRef.current.push(scrambleWordTimeout);
      });
    }

    // Cleanup on unmount or dependency change
    return () => {
      isActiveRef.current = false;
      timeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      timeoutsRef.current = [];
    };
  }, [
    inView,
    wordsArray,
    maxCharDelay,
    scrambleTimes,
    scrambleInterval,
    staggerDelay,
  ]);

  return (
    <span className="word-container">
      {words.map((wordObj) => (
        <span key={wordObj.key} className="word">
          {wordObj.chars.map((charObj) => (
            <span
              key={charObj.key}
              className="char"
              style={{
                opacity: charObj.isRevealed ? 1 : initialOpacity, // Use isRevealed to control opacity
                transition: "0.48s ease opacity",
              }}
            >
              {charObj.char}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
