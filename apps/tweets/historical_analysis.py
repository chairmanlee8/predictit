import logging, math, os, pprint, sys, time
from datetime import datetime, date, timedelta
from pytz import timezone
import pandas as pd
from pandas import DataFrame as df
import numpy as np
from scipy.stats import truncnorm
from statsmodels.tsa.stattools import acovf
from tweet import Tweet, load_df_from_csv
from common import Market, Bracket, Prediction

pp = pprint.PrettyPrinter(indent=4)


def get_current_market_datetimes(screen_name):
    # tweet market weekdays
    weekday_of_market = {"realDonaldTrump": 2, "WhiteHouse": 3, "POTUS": 4}
    weekday = weekday_of_market[screen_name]

    # go back one day at a time until we are on the date past-noon
    start_date = datetime.now()
    while not (start_date.weekday() == weekday and start_date.hour >= 12):
        start_date -= timedelta(days=1)
        start_date = start_date.replace(hour=12, minute=0, second=0, microsecond=0)
    start_date = start_date.replace(hour=12, minute=0, second=0, microsecond=0)

    end_date = datetime.now()
    while not (end_date.weekday() == weekday and end_date.hour < 12):
        end_date += timedelta(days=1)
        end_date = end_date.replace(hour=11, minute=59, second=59, microsecond=0)

    return start_date, end_date.replace(hour=11, minute=59, second=59, microsecond=0)


# return am, pm hours left
def get_hours_left(now, end_time):
    if now >= end_time:
        return 0, 0

    am_hours_left = 0
    pm_hours_left = 0

    while now < end_time:
        noon = now.replace(hour=12, minute=0, second=0, microsecond=0)
        midnight = noon + timedelta(hours=12)

        if now < noon:
            am_hours_left += (noon - now).total_seconds() / 3600
            now = noon
        else:
            pm_hours_left += (min(midnight, end_time) - now).total_seconds() / 3600
            now = midnight

    return am_hours_left, pm_hours_left


def detect_storms(df, storm_threshold=timedelta(minutes=10), storm_threshold_count=10):
    df["last_tweet"] = df.created_at.shift(periods=-1)
    df["last_tweet_ago"] = df.created_at - df.last_tweet
    df["last_tweet_ago_stormy"] = df.last_tweet_ago < storm_threshold
    df["possible_storm_id_gen"] = (
        df.last_tweet_ago_stormy.astype(int).diff().abs().cumsum()
    )
    df["possible_storm_id"] = np.where(
        df.last_tweet_ago_stormy, df.possible_storm_id_gen, None
    )
    storm_size = df.groupby("possible_storm_id").size()

    def storm_size_or_zero(x):
        try:
            return storm_size[x]
        except:
            return 0

    def is_storm(x):
        # filter out storm_id = 0...just a cumsum artifact
        if x == 0:
            return False
        elif storm_size_or_zero(x) > storm_threshold_count:
            return True
        else:
            return False

    def storm_id(x):
        if is_storm(x):
            return x
        else:
            return None

    df["is_storm"] = df["possible_storm_id"].apply(is_storm)
    df["storm_id"] = df["possible_storm_id"].apply(storm_id)

    storms = pd.concat(
        [
            df.groupby("storm_id").size().rename("storm_size"),
            df.groupby("storm_id")["weekday"].min().rename("start_weekday"),
            df.groupby("storm_id")["created_at"].min().rename("first_tweet"),
            df.groupby("storm_id")["created_at"].max().rename("last_tweet"),
        ],
        axis=1,
    )

    return df, storms


# window_days: number of days to consider historically for computing tweet statistics
def predict(market, prediction_time=None, window_days=30, adjust_current_count=0):
    debug_info = {}

    tweets_csv = market.handle + ".csv"
    df = load_df_from_csv(tweets_csv)
    df["created_at"] = df["created_at"].apply(
        lambda x: datetime.replace(x, tzinfo=None)
    )

    # CR: maybe dont replace variables so we can assign debug_info on one contiguous block at the end
    debug_info["dataset_cardinality"] = len(df.index)
    debug_info["last_tweet"] = df["created_at"].max()

    # label storms and calculate storm stats
    df, storms = detect_storms(df)

    now = datetime.now()
    start_date, end_date = get_current_market_datetimes(market.handle)
    end_date = prediction_time or end_date
    am_hours_left, pm_hours_left = get_hours_left(now, end_date)

    debug_info["am_hours_left"] = am_hours_left
    debug_info["pm_hours_left"] = pm_hours_left

    print(start_date)
    print(end_date)
    current_df = df[(df["created_at"] > start_date) & (df["created_at"] < end_date)]
    current_count = len(current_df.index) + (adjust_current_count or 0)

    debug_info["market_start_time"] = start_date
    debug_info["market_end_time"] = end_date
    debug_info["current_count"] = current_count

    moving_cutoff = now - timedelta(days=window_days)
    moving_df = df[df.created_at > moving_cutoff]

    tweets_by_date = moving_df[~moving_df.is_storm].groupby("date").size().rename("day")
    storm_tweets_by_date = (
        moving_df[moving_df.is_storm].groupby("date").size().rename("storm")
    )
    am_tweets_by_date = (
        moving_df[(~moving_df.is_storm) & (moving_df["hour"] < 12)]
        .groupby("date")
        .size()
        .rename("am")
    )
    pm_tweets_by_date = (
        moving_df[(~moving_df.is_storm) & (moving_df["hour"] >= 12)]
        .groupby("date")
        .size()
        .rename("pm")
    )
    tweets_by_date = pd.concat(
        [tweets_by_date, am_tweets_by_date, pm_tweets_by_date, storm_tweets_by_date],
        axis=1,
        sort=True,
    ).fillna(0)
    tweets_today = tweets_by_date[tweets_by_date.index == str(now.date())]

    if not tweets_today.empty:
        debug_info["today_total"] = tweets_today["day"][0]
        debug_info["today_am"] = tweets_today["am"][0]
        debug_info["today_pm"] = tweets_today["pm"][0]
        debug_info["today_storm"] = tweets_today["storm"][0]
    else:
        debug_info["today_total"] = {"value": 0}
        debug_info["today_am"] = {"value": 0}
        debug_info["today_pm"] = {"value": 0}
        debug_info["today_storm"] = {"value": 0}

    tweets_by_date = tweets_by_date[1:-1].fillna(0)
    am_mean = tweets_by_date["am"].mean()
    am_var = tweets_by_date["am"].var()
    am_std = math.sqrt(am_var)
    pm_mean = tweets_by_date["pm"].mean()
    pm_var = tweets_by_date["pm"].var()
    pm_std = math.sqrt(pm_var)
    day_mean = tweets_by_date["day"].mean()
    day_std = math.sqrt(tweets_by_date["day"].var())
    debug_info["am_mean"] = am_mean
    debug_info["am_std"] = am_std
    debug_info["pm_mean"] = pm_mean
    debug_info["pm_std"] = pm_std
    debug_info["day_mean"] = day_mean
    debug_info["day_std"] = day_std
    print(tweets_by_date)
    prediction_left = (am_mean * (am_hours_left / 12)) + (
        pm_mean * (pm_hours_left / 12)
    )
    # day_autocov = acovf(tweets_by_date["day"], fft=False)[1]
    # CR: assuming am/pm tweeting is independent...it's probably not
    prediction_var = am_var * (am_hours_left / 12) + pm_var * (pm_hours_left / 12)
    prediction_mean = current_count + prediction_left
    prediction_std = math.sqrt(prediction_var)
    debug_info["prediction_mean"] = prediction_mean
    debug_info["prediction_std"] = prediction_std

    prediction = {}
    for bracket in market.brackets:
        lower = current_count
        upper = 1_000
        bracket_ub = bracket.hi + 0.5
        bracket_lb = bracket.lo - 0.5
        loc = prediction_mean
        scale = prediction_std
        a = (lower - loc) / scale
        b = (upper - loc) / scale
        prediction[bracket.name] = truncnorm.cdf(
            bracket_ub, a, b, loc, scale
        ) - truncnorm.cdf(bracket_lb, a, b, loc, scale)

    return Prediction(
        stamp_time=now,
        prediction_time=end_date,
        prediction=prediction,
        debug_info=debug_info,
    )


def heatmap_daily(df):
    g = (
        df.groupby("date", as_index=False, observed=False)
        .size()
        .reset_index(name="count")
    )
    g["pct_rank"] = g["count"].rank(pct=True)
    g = g.set_index("date", drop=True)
    return g


def heatmap_hourly(df):
    g = (
        df.groupby(["date", "hour"], as_index=False, observed=False)
        .size()
        .reset_index(name="count")
    )
    g["pct_rank"] = g["count"].rank(pct=True)

    # CR: missing "3" hour column...need a smarter way of re-indexing...
    # the smarter indexing might also obviate the need to pivot
    index = pd.date_range(g.date.min(), g.date.max())
    g = g.pivot(index="date", columns="hour", values=["pct_rank", "count"]).fillna(0)
    g.index = pd.to_datetime(g.index)
    g = g.reindex(index, fill_value=0)

    return g


if __name__ == "__main__":
    logging.basicConfig(
        format="%(asctime)s %(levelname)s: %(message)s", level=logging.INFO
    )

    handle = sys.argv[1]
    bracket_low, bracket_high, bracket_width = tuple(map(int, sys.argv[2].split("-")))
    brackets = [Bracket("B1", 0, bracket_low - 1)]
    for i, x in enumerate(range(bracket_low, bracket_high, bracket_width)):
        brackets.append(Bracket("B%d" % (i + 2), x, x + bracket_width - 1))
    brackets.append(Bracket("B9", bracket_high, 1_000_000))
    market = Market(handle, brackets)

    pp.pprint(market)

    # lean = int(sys.argv[3])

    # def print_summary_stats(col):
    #     print(
    #         f"tweets per {col}: μ={round(tweets_by_date[col].mean(), 2)} σ={round(tweets_by_date[col].std(), 2)} min={tweets_by_date[col].min()} max={tweets_by_date[col].max()}"
    #     )

    # CR: graph of historical weeks, prediction, and current on dygraphs

    # CR: hourly heat-map like on accountanalysis

    # CR: a couple weaknesses w/ the normal distribution chosen
    # when a storm starts, the mean/stdev becomes meaningless -- should just not trade (get out of the way)
    # as the day advances, prediction_std should go down...tighten by many points towards the mean...this can be quite dramatic on even the 1sd wings

    # CR: compute greeks (surprise=dfair/dlean, theta=dfair/dtime)
    # shock = dsurprise/dlean...maybe not useful

    # CR: show the EOD prediction so that SURPRISE can be set

    eod = datetime.now().replace(hour=23, minute=59, second=59, microsecond=0)
    eod_prediction = predict(
        market, prediction_time=eod, adjust_current_count=int(sys.argv[3])
    )
    eom_prediction = predict(market, adjust_current_count=int(sys.argv[3]))

    print("")
    print(
        "EOD: %0.2f s.d. %0.2f"
        % (
            round(eod_prediction.debug_info["prediction_mean"], 2),
            round(eod_prediction.debug_info["prediction_std"], 2),
        )
    )
    print("")

    for k, v in eom_prediction.prediction.items():
        print("%s %0.2f %0.2f" % (k, round(v, 2), round(1 - v, 2)))
    # pp.pprint(eod_prediction.debug_info)
    pp.pprint(eom_prediction.debug_info)
