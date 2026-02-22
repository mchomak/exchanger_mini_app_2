import { useCallback, useRef, useState } from "react";
import { api } from "../api/client";
import type { CalcResult, Direction } from "../types";

export function useExchanger() {
  const [directions, setDirections] = useState<Direction[]>([]);
  const [loading, setLoading] = useState(false);
  const directionsRef = useRef<Direction[]>([]);

  const getDirections = useCallback(async (): Promise<Direction[]> => {
    setLoading(true);
    try {
      const data = await api.getDirections();
      setDirections(data);
      directionsRef.current = data;
      return data;
    } finally {
      setLoading(false);
    }
  }, []);

  const calculate = useCallback(
    async (directionId: string, amount: number, action: string = "give"): Promise<CalcResult> => {
      return api.calculate(directionId, amount, action);
    },
    []
  );

  const findDirection = useCallback(
    (giveCode: string, getCode: string): Direction | undefined => {
      const dirs = directionsRef.current.length > 0 ? directionsRef.current : directions;
      const giveLower = giveCode.toLowerCase();
      const getKeywords = getCode.toLowerCase().split(/\s+/);
      return dirs.find((d) => {
        const gt = d.currency_give_title.toLowerCase();
        const gett = d.currency_get_title.toLowerCase();
        return gt.includes(giveLower) && getKeywords.every((kw) => gett.includes(kw));
      });
    },
    [directions]
  );

  return { directions, loading, getDirections, calculate, findDirection };
}
