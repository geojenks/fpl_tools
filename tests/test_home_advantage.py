"""Run with: python3 -m unittest discover -s tests -p "test_*.py" """
import importlib.util
import math
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location(
    "home_advantage", Path(__file__).resolve().parent.parent / "analysis" / "home_advantage.py")
ha = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ha)


def row(**kw):
    base = dict(season="2024-25", element="1", pos="MID", minutes=90, points=2, home=True, goals=0, assists=0,
                cs=0, gc=0, saves=0, bonus=0, yc=0, rc=0, og=0, pm=0, ps=0)
    base.update(kw)
    return ha.Row(**base)


class HomeAdvantage(unittest.TestCase):
    def test_components_add_up_to_the_points(self):
        # Defender: 90 mins (2), clean sheet (4), goal (6), assist (3), 3 bonus, a yellow card (-1).
        r = row(pos="DEF", points=2 + 4 + 6 + 3 + 3 - 1, goals=1, assists=1, cs=1, bonus=3, yc=1)
        parts = ha.components(r)
        self.assertEqual(sum(parts.values()), r.points)
        self.assertEqual(parts["Other (e.g. defensive contributions)"], 0)
        self.assertEqual(parts["Clean sheets"], 4)
        self.assertEqual(parts["Goals"], 6)

    def test_conceding_and_saves_by_position(self):
        gk = ha.components(row(pos="GKP", points=2 - 2 + 2, gc=4, saves=7))
        self.assertEqual((gk["Goals conceded"], gk["Saves"]), (-2, 2))
        mid = ha.components(row(pos="MID", points=2, gc=4, saves=7))
        self.assertEqual((mid["Goals conceded"], mid["Saves"]), (0, 0))  # only GK/DEF concede, only GK saves
        sub = ha.components(row(pos="DEF", minutes=30, points=1, cs=1))
        self.assertEqual(sub["Clean sheets"], 0)  # needs 60 minutes

    def test_welch_difference_and_interval(self):
        home, away = ha.Acc(), ha.Acc()
        for x in (3, 5, 4, 6):
            home.add(x)
        for x in (2, 4, 3, 5):
            away.add(x)
        diff, ci = ha.welch(home, away)
        self.assertAlmostEqual(diff, 1.0)
        var = 5 / 3  # both samples have variance 5/3
        self.assertAlmostEqual(ci, 1.96 * math.sqrt(var / 4 + var / 4))

    def test_paired_compares_players_with_themselves(self):
        rows = []
        # Two players, both exactly +1 at home, but very different quality.
        for element, base in (("a", 2), ("b", 7)):
            rows += [row(element=element, home=True, points=base + 1) for _ in range(6)]
            rows += [row(element=element, home=False, points=base) for _ in range(6)]
        diff, ci, n = ha.paired(rows)
        self.assertAlmostEqual(diff, 1.0)
        self.assertEqual(n, 2)
        # Players without enough games each way are ignored.
        diff, _, n = ha.paired(rows + [row(element="c", home=True, points=20)])
        self.assertEqual(n, 2)


if __name__ == "__main__":
    unittest.main()
