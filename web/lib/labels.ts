// Human-readable labels for warehouse columns. The agent's result tables
// show whatever columns its SQL returns, so this covers every documented
// mart column plus a token-based fallback for aliases invented on the fly.

const KNOWN_COLUMNS: Record<string, string> = {
  // identity / keys
  full_name: "Player",
  team_abbrev: "Team",
  team_abbrevs: "Team(s)",
  opponent: "Opponent",
  opponent_abbrev: "Opponent",
  tri_code: "Team",
  team_name: "Team Name",
  position_code: "Position",
  position_group: "Position Group",
  season_id: "Season",
  player_id: "Player ID",
  game_id: "Game ID",
  game_type: "Game Type",
  conference: "Conference",
  division: "Division",
  is_active: "Active",
  age: "Age",
  birth_date: "Birth Date",
  draft_year: "Draft Year",
  draft_round: "Draft Round",
  draft_overall: "Draft Pick (Overall)",

  // games / schedule
  game_date: "Game Date",
  game_number: "Game #",
  player_game_number: "Player Game #",
  is_home: "Home",
  result: "Result",
  last_period_type: "Ended In",
  rest_days: "Rest Days",
  is_back_to_back: "Back-to-Back",
  round: "Playoff Round",
  series: "Series",
  game_in_series: "Game in Series",

  // skater counting stats
  games_played: "Games Played",
  goals: "Goals",
  assists: "Assists",
  points: "Points",
  shots: "Shots",
  pim: "Penalty Minutes",
  plus_minus: "Plus/Minus",
  hits: "Hits",
  blocked_shots: "Blocked Shots",
  takeaways: "Takeaways",
  giveaways: "Giveaways",
  pp_goals: "Power Play Goals",
  pp_points: "Power Play Points",
  sh_goals: "Short-Handed Goals",
  sh_points: "Short-Handed Points",
  ev_goals: "Even-Strength Goals",
  ev_points: "Even-Strength Points",
  game_winning_goals: "Game-Winning Goals",
  shifts: "Shifts",

  // percentages / rates
  shooting_pct: "Shooting %",
  faceoff_pct: "Faceoff %",
  faceoff_win_pct: "Faceoff %",
  point_pct: "Point %",
  pp_pct: "Power Play %",
  pk_pct: "Penalty Kill %",
  pp_net_pct: "Net Power Play %",
  pk_net_pct: "Net Penalty Kill %",
  save_pct: "Save %",
  goals_against_average: "Goals-Against Average",
  win_pct_per_start: "Win % per Start",
  shutout_rate: "Shutout Rate",

  // ice time
  toi_minutes: "Ice Time (min)",
  toi_minutes_per_gp: "Ice Time per Game (min)",
  ev_toi_minutes_per_gp: "EV Ice Time per Game (min)",
  pp_toi_minutes_per_gp: "PP Ice Time per Game (min)",
  sh_toi_minutes_per_gp: "SH Ice Time per Game (min)",

  // per-game rates
  goals_per_gp: "Goals per Game",
  assists_per_gp: "Assists per Game",
  points_per_gp: "Points per Game",
  shots_per_gp: "Shots per Game",
  pp_points_per_gp: "PP Points per Game",
  hits_per_gp: "Hits per Game",
  blocks_per_gp: "Blocks per Game",
  pim_per_gp: "Penalty Minutes per Game",

  // per-60 rates
  goals_per_60: "Goals per 60",
  assists_per_60: "Assists per 60",
  points_per_60: "Points per 60",
  shots_per_60: "Shots per 60",
  hits_per_60: "Hits per 60",
  blocks_per_60: "Blocks per 60",
  ev_points_per_60: "EV Points per 60",
  ev_goals_per_60: "EV Goals per 60",
  pp_points_per_60: "PP Points per 60",

  // team game / season
  goals_for: "Goals For",
  goals_against: "Goals Against",
  goals_for_per_game: "Goals For per Game",
  goals_against_per_game: "Goals Against per Game",
  shots_for: "Shots For",
  shots_against: "Shots Against",
  shots_for_per_game: "Shots For per Game",
  shots_against_per_game: "Shots Against per Game",
  pp_goals_for: "PP Goals For",
  pp_opportunities: "PP Opportunities",
  pp_goals_against: "PP Goals Against",
  times_shorthanded: "Times Short-Handed",
  wins: "Wins",
  losses: "Losses",
  ot_losses: "OT Losses",
  regulation_wins: "Regulation Wins",
  shootout_wins: "Shootout Wins",
  shutouts: "Shutouts",
  goal_differential: "Goal Differential",

  // rolling form
  pp_pct_last_5: "Power Play %, Last 5",
  pp_pct_last_10: "Power Play %, Last 10",
  pp_pct_last_15: "Power Play %, Last 15",
  pk_pct_last_5: "Penalty Kill %, Last 5",
  pk_pct_last_10: "Penalty Kill %, Last 10",
  pk_pct_last_15: "Penalty Kill %, Last 15",
  points_last_10: "Points, Last 10",
  goals_last_10: "Goals, Last 10",
  shots_last_10: "Shots, Last 10",
  xg_last_10: "Expected Goals, Last 10",
  finishing_last_10: "Finishing vs Expected, Last 10",
  points_per_gp_last_10: "Points per Game, Last 10",
  season_points_per_gp: "Season Points per Game",
  form_delta: "Form vs Season Baseline",
  games_in_window: "Games in Window",

  // xG
  xg: "Expected Goals (xG)",
  xg_for: "Expected Goals For",
  xg_against: "Expected Goals Against",
  xg_share: "Expected Goals Share",
  expected_goals: "Expected Goals",
  goals_above_expected: "Goals Above Expected",
  goals_above_expected_for: "Finishing Above Expected",
  goals_above_expected_against: "Goals Allowed vs Expected",
  unblocked_attempts: "Unblocked Attempts",
  unblocked_attempts_for: "Unblocked Attempts For",
  unblocked_attempts_against: "Unblocked Attempts Against",
  goals_for_model: "Goals (Model Scope)",
  goals_against_model: "Goals Against (Model Scope)",
  xg_per_attempt: "xG per Attempt",
  rebound_attempts: "Rebound Attempts",
  rush_attempts: "Rush Attempts",
  avg_shot_distance_ft: "Avg Shot Distance (ft)",

  // shots
  distance_ft: "Distance (ft)",
  angle_deg: "Angle (deg)",
  shot_type: "Shot Type",
  strength_state: "Strength",
  is_goal: "Goal",
  is_rebound: "Rebound",
  is_rush: "Rush",
  is_empty_net: "Empty Net",
  zone_code: "Zone",
  event_type: "Event",
  x_coord: "X",
  y_coord: "Y",

  // careers / goalies
  seasons_played: "Seasons Played",
  playoff_seasons: "Playoff Seasons",
  first_season_id: "First Season",
  last_season_id: "Last Season",
  last_team_abbrevs: "Last Team(s)",
  games_started: "Games Started",
  saves: "Saves",
  saves_per_start: "Saves per Start",
  shots_against_per_start: "Shots Against per Start",

  // similarity
  similarity_score: "Similarity Score",
  rank: "Rank",
  comp_player_id: "Comp Player ID",
  profile: "Profile",
};

// token expansion for agent-invented aliases the dictionary doesn't know
const TOKENS: Record<string, string> = {
  xg: "xG",
  ev: "EV",
  pp: "PP",
  pk: "PK",
  sh: "SH",
  gp: "GP",
  toi: "TOI",
  pct: "%",
  pcts: "%",
  pctg: "%",
  avg: "Avg",
  pts: "Pts",
  gaa: "GAA",
  otl: "OTL",
  sog: "SOG",
  pim: "PIM",
  yoy: "YoY",
  vs: "vs",
  per: "per",
  ft: "(ft)",
  deg: "(deg)",
  min: "(min)",
  num: "#",
  id: "ID",
  rs: "Reg. Season",
  po: "Playoff",
};

/** "xg_for" -> "Expected Goals For"; unknown aliases get token-cased. */
export function humanizeColumn(column: string): string {
  const known = KNOWN_COLUMNS[column.toLowerCase()];
  if (known) return known;
  return column
    .split("_")
    .filter(Boolean)
    .map((token) => TOKENS[token.toLowerCase()] ?? token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

/** True when showing "(raw_name)" next to the label would be pure noise. */
export function labelMatchesRaw(column: string): boolean {
  return humanizeColumn(column).toLowerCase() === column.toLowerCase();
}
