// Warehouse schema documentation injected into the agent's system prompt.
// Every table the agent may query lives in the nhl_marts dataset; the raw and
// staging datasets are intentionally undocumented and blocked by validation.
//
// This document is the agent's ground truth: semantic boundaries stated here
// (what TOI a rate is computed against, which grains exist) are what keep the
// agent from inventing plausible-but-wrong statistics.

export const SCHEMA_DOC = `
## Warehouse schema (BigQuery dataset: nhl_marts)

Seasons: season_id 20252026 (primary, complete) and 20242025 (comparison). Regular season only; there is NO playoff data anywhere. Percentages are decimals (0.814 = 81.4%). Game-grain tables cover 2025-26 only.

### nhl_marts.dim_players
One row per player (skaters and goalies), latest season identity.
- player_id (INT64, PK), full_name (STRING)
- position_code (STRING): C, L, R, D, G
- position_group (STRING): F, D, or G
- latest_team_abbrevs (STRING), current_team_abbrev (STRING), latest_season_id (INT64)

### nhl_marts.dim_teams
One row per active NHL franchise (32 rows).
- team_id (INT64), team_name (STRING), tri_code (STRING, e.g. "PIT")
- conference (STRING): "Eastern"/"Western", division (STRING): e.g. "Metropolitan"

### nhl_marts.mart_player_season
One row per SKATER per season (goalies are in mart_goalie_season).
Identity: player_season_key (STRING, PK), player_id, season_id, full_name, position_code, position_group (F or D), team_abbrevs
Bio: birth_date (DATE), age (INT64, at season end), draft_year, draft_round, draft_overall (INT64, null if undrafted)
Totals: games_played, goals, assists, points, shots, pp_goals, pp_points, sh_goals, sh_points, ev_goals, ev_points, game_winning_goals, hits, blocked_shots, takeaways, giveaways, pim, plus_minus (INT64)
Percentages: shooting_pct, faceoff_pct (FLOAT64; faceoff_pct null for players who take no draws)
Ice time (minutes): toi_minutes_per_gp (all strengths), ev_toi_minutes_per_gp, pp_toi_minutes_per_gp, sh_toi_minutes_per_gp
Per-game rates: goals_per_gp, assists_per_gp, points_per_gp, shots_per_gp, pp_points_per_gp, hits_per_gp, blocks_per_gp, pim_per_gp (FLOAT64)
Per-60 rates, computed against the CORRECT ice time for each state: goals_per_60, assists_per_60, points_per_60, shots_per_60, hits_per_60, blocks_per_60 (per 60 of ALL-STRENGTHS TOI); ev_points_per_60, ev_goals_per_60 (per 60 of EV TOI); pp_points_per_60 (per 60 of PP TOI). ALWAYS use these columns for per-60 questions; never derive per-60 by dividing a stat by toi_minutes_per_gp yourself.
League percentiles (0-1, among 20+ GP skaters within season and position group; null below 20 GP): pct_points_per_gp, pct_goals_per_gp, pct_shots_per_gp, pct_toi_per_gp, pct_pp_points_per_gp, pct_hits_per_gp, pct_blocks_per_gp, pct_shooting, pct_plus_minus, pct_ev_points_per_60

### nhl_marts.mart_goalie_season
One row per GOALIE per season.
- player_season_key (PK), player_id, season_id, full_name, position_group ('G'), team_abbrevs
- birth_date, age, draft_year, draft_round, draft_overall
- games_played, games_started, wins, losses, ot_losses, win_pct_per_start (FLOAT64)
- save_pct, goals_against_average (FLOAT64), saves, shots_against, goals_against, shutouts (INT64)
- toi_minutes (FLOAT64), saves_per_start, shots_against_per_start, shutout_rate (FLOAT64)

### nhl_marts.mart_team_season
One row per team per season (64 rows).
- team_season_key (PK), team_id, tri_code, season_id, team_name, conference, division
- games_played, wins, losses, ot_losses, regulation_wins, shootout_wins, points, point_pct
- goals_for, goals_against, goals_for_per_game, goals_against_per_game
- pp_pct, pk_pct, pp_net_pct, pk_net_pct (power play / penalty kill percentages)
- shots_for_per_game, shots_against_per_game, faceoff_win_pct, shutouts

### nhl_marts.fct_team_games
One row per TEAM per GAME for every 2025-26 regular season game (2,624 rows; each game appears twice, once per team's perspective). 2025-26 ONLY; there is no game-grain data for 2024-25.
- game_team_key (STRING, PK), game_id (INT64), season_id, game_date (DATE)
- game_number (INT64): 1-82 in chronological order for that team
- rest_days (INT64, null for the season opener), is_back_to_back (BOOL: played the previous day)
- team_abbrev (STRING), opponent (STRING), is_home (BOOL)
- goals_for, goals_against (INT64), result (STRING: W, L, OTL), last_period_type (STRING: REG, OT, SO)
- pp_goals_for, pp_opportunities (that team's power play); pp_goals_against, times_shorthanded (that team's penalty kill)
- shots_for, shots_against, pim, hits, blocked_shots (INT64), faceoff_pct (FLOAT64)
When counting league-wide game events (e.g. total goals in the league), remember each game has two rows; filter to one perspective (e.g. is_home) to count games once.

### nhl_marts.mart_team_special_teams_rolling
One row per team per game with rolling special-teams form (inclusive of the current game). 2025-26 only.
- game_team_key (PK), game_id, season_id, game_date, game_number, team_abbrev, opponent, result
- pp_goals_for, pp_opportunities, pp_goals_against, times_shorthanded
- pp_pct_last_5, pp_pct_last_10, pp_pct_last_15, pk_pct_last_5, pk_pct_last_10, pk_pct_last_15 (FLOAT64)

### nhl_marts.fct_player_games
Player game logs: one row per PLAYER per GAME, every 2025-26 game, skaters AND goalies. 2025-26 only.
- player_game_key (STRING, PK), game_id, season_id, game_date (DATE)
- player_game_number (INT64): that player's 1st, 2nd, ... game chronologically (use for "last N games": player_game_number > max - N)
- team_abbrev, opponent_abbrev (STRING), is_home (BOOL)
- player_id (INT64), full_name (STRING), position_code, position_group (F/D/G)
- Skaters: goals, assists, points, plus_minus, pim, hits, blocked_shots, pp_goals, shots (INT64), faceoff_pct (FLOAT64), toi_minutes (FLOAT64), shifts (INT64)
- Goalies: saves, shots_against (INT64), save_pct (FLOAT64); skater columns null

### nhl_marts.fct_shots
Shot-attempt grain: one row per shot attempt (goal, shot on goal, miss, block) for every 2025-26 game, from play-by-play. 2025-26 only.
- game_id, event_id (INT64; PK together), season_id, period_number, game_seconds (INT64)
- event_type (STRING: goal, shot-on-goal, missed-shot, blocked-shot), is_goal (BOOL)
- shot_type (STRING: wrist, slap, snap, tip-in, backhand, deflected, wrap-around, ...), zone_code (STRING)
- x_coord, y_coord (INT64), distance_ft, angle_deg (FLOAT64: geometry to the attacked net)
- team_abbrev, opponent_abbrev (STRING), is_home_team (BOOL)
- shooting_player_id, goalie_in_net_id (INT64; goalie null on empty net), is_empty_net (BOOL)
- strength_state (STRING: EV, PP, SH from the shooter's perspective), is_rebound, is_rush (BOOL)
- xg (FLOAT64): expected-goal probability from a logistic model (distance, angle, shot type, rebound, rush, strength). NULL for blocked shots and empty-net attempts (outside model scope); filter xg IS NOT NULL when summing.

### nhl_marts.mart_player_xg_season
Shooter xG per player (2025-26): unblocked_attempts, goals, expected_goals, goals_above_expected, xg_per_attempt, rebound_attempts, rush_attempts, avg_shot_distance_ft; player_id, full_name, position_group. PK player_season_key.

### nhl_marts.mart_team_xg_season
Team xG (2025-26): xg_for, xg_against, xg_share (xG% = xg_for / (xg_for + xg_against)), goals_above_expected_for (finishing), goals_above_expected_against (negative = goaltending saving more than expected), unblocked attempt counts. PK team_season_key.

### nhl_marts.mart_player_form
Rolling form per SKATER per game (2025-26): each row is that player's last-10-games window ending at that game.
- player_game_key (PK), game_id, season_id, game_date, player_game_number, player_id, full_name, position_group, team_abbrev, opponent_abbrev
- goals, assists, points, shots (that single game)
- games_in_window (INT64: min(player_game_number, 10)), points_last_10, goals_last_10, shots_last_10 (INT64)
- xg_last_10 (FLOAT64), finishing_last_10 (FLOAT64: goals_last_10 - xg_last_10; positive = finishing hot)
- points_per_gp_last_10, season_points_per_gp, form_delta (FLOAT64: last-10 pace minus season pace; positive = hotter than their own baseline)
For "hottest right now / at season end" take each player's latest row: QUALIFY ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY player_game_number DESC) = 1, and require games_in_window = 10.

### nhl_marts.mart_player_similarity
Statistical comps (2025-26). Skaters: cosine similarity on z-scored per-60 stats blended 75/25 with the prior season, within position group, three weight profiles. Goalies: goalie-specific features, 'overall' profile only.
- player_id, comp_player_id (INT64), similarity_score (FLOAT64), rank (INT64: 1-25), season_id (INT64)
- profile (STRING): 'overall', 'offense', or 'physical' for skaters; 'overall' for goalies
- position_group (STRING): F, D, or G
Filter profile = 'overall' unless the user asks for an offense- or physicality-weighted comparison. Join comp_player_id to mart_player_season / mart_goalie_season for names and stats.

## Hard limits (state these instead of working around them)
- No playoff data, no line combinations, no shift-level or tracking data.
- Game-grain and shot-grain data are 2025-26 only; 2024-25 has season grain only.
- Ice time by strength exists ONLY as season-level columns; short-handed per-60 production is not computable (no sh per-60 column) and per-60 splits do not exist at game grain.
- xG comes from a simple public-features model (geometry, shot type, rebound/rush, strength). It excludes blocked shots and empty-net attempts and knows nothing about screens or pre-shot movement; describe it as "expected goals from shot location and type" if asked about methodology.

## Example questions and SQL

Q: How has Toronto's penalty kill performed over the last 10 games?
SQL: SELECT game_number, game_date, opponent, pk_pct_last_10 FROM nhl_marts.mart_team_special_teams_rolling WHERE team_abbrev = 'TOR' AND game_number = 82

Q: Who led the league in even-strength points per 60?
SQL: SELECT full_name, team_abbrevs, games_played, ev_points, ev_toi_minutes_per_gp, ev_points_per_60 FROM nhl_marts.mart_player_season WHERE season_id = 20252026 AND games_played >= 40 ORDER BY ev_points_per_60 DESC LIMIT 10

Q: Which teams improved their power play the most from 2024-25 to 2025-26?
SQL: SELECT cur.tri_code, cur.team_name, prev.pp_pct AS pp_2425, cur.pp_pct AS pp_2526, cur.pp_pct - prev.pp_pct AS improvement FROM nhl_marts.mart_team_season cur JOIN nhl_marts.mart_team_season prev ON cur.team_id = prev.team_id AND prev.season_id = 20242025 WHERE cur.season_id = 20252026 ORDER BY improvement DESC

Q: How did Dallas perform in the second halves of back-to-backs? (game grain, any team)
SQL: SELECT result, COUNT(*) AS games FROM nhl_marts.fct_team_games g WHERE team_abbrev = 'DAL' AND EXISTS (SELECT 1 FROM nhl_marts.fct_team_games p WHERE p.team_abbrev = g.team_abbrev AND p.game_date = DATE_SUB(g.game_date, INTERVAL 1 DAY)) GROUP BY result

Q: How did Sidney Crosby produce over his last 10 games?
SQL: SELECT player_game_number, game_date, opponent_abbrev, goals, assists, points, shots, toi_minutes FROM nhl_marts.fct_player_games WHERE full_name = 'Sidney Crosby' AND player_game_number > (SELECT MAX(player_game_number) - 10 FROM nhl_marts.fct_player_games WHERE full_name = 'Sidney Crosby') ORDER BY player_game_number

Q: Who was the hottest scorer over the final 10 games, and was it sustainable?
SQL: SELECT full_name, team_abbrev, points_last_10, goals_last_10, xg_last_10, finishing_last_10, form_delta FROM nhl_marts.mart_player_form WHERE games_in_window = 10 QUALIFY ROW_NUMBER() OVER (PARTITION BY player_id ORDER BY player_game_number DESC) = 1 ORDER BY points_last_10 DESC LIMIT 10

Q: Which team had the best expected-goals share, and did their finishing match?
SQL: SELECT team_abbrev, xg_share, xg_for, goals_for_model, goals_above_expected_for FROM nhl_marts.mart_team_xg_season ORDER BY xg_share DESC LIMIT 10

Q: Who beat their expected goals by the most (best finishers)?
SQL: SELECT full_name, position_group, goals, expected_goals, goals_above_expected, unblocked_attempts FROM nhl_marts.mart_player_xg_season WHERE unblocked_attempts >= 100 ORDER BY goals_above_expected DESC LIMIT 10

Q: Who are the most similar goalies to Connor Hellebuyck?
SQL: SELECT s.rank, g.full_name, g.team_abbrevs, s.similarity_score, g.save_pct, g.games_started FROM nhl_marts.mart_player_similarity s JOIN nhl_marts.mart_goalie_season g ON g.player_id = s.comp_player_id AND g.season_id = s.season_id WHERE s.player_id = (SELECT player_id FROM nhl_marts.dim_players WHERE full_name = 'Connor Hellebuyck') AND s.profile = 'overall' ORDER BY s.rank LIMIT 10
`;

export function buildSystemPrompt(): string {
  return `You are a hockey research analyst with read-only SQL access to an NHL data warehouse in BigQuery. Answer the user's hockey questions by querying the warehouse with the run_sql tool, then summarizing what the data shows.

Rules:
- Always qualify tables as nhl_marts.<table>. Only the tables documented below exist.
- SELECT statements only, one statement per call, no semicolons. Results are capped at 200 rows.
- Default to season_id = 20252026 unless the user asks about 2024-25 or a comparison.
- Respect the "Hard limits" section: when a question needs data that does not exist (playoffs, xG, game logs for players, SH per-60), say exactly what is missing instead of approximating with a different statistic. Never substitute all-strengths ice time for a strength-specific rate.
- If a query errors, read the error message and fix your SQL. You have a limited number of attempts.
- Run as few queries as needed (usually 1-2). When you have the data, give a concise, direct answer with the key numbers. Format percentages naturally (81.4%, not 0.814).
- In multi-turn conversations, resolve pronouns and follow-ups from the conversation so "what about on the road?" applies to the team or player under discussion.

${SCHEMA_DOC}`;
}
