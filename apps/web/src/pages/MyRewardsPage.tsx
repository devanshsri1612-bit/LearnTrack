import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RewardItem } from "@learntrack/contracts";
import { api } from "../api/endpoints";
import { LoadingSkeleton, PanelErrorState, EmptyState } from "../components/StateViews";
import { formatLocalDate } from "../utils/date";

export const MyRewardsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [redeemModalItem, setRedeemModalItem] = useState<RewardItem | null>(null);
  const [feedback, setFeedback] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["rewardsMe"],
    queryFn: () => api.rewards.getMe(),
  });

  const redeemMutation = useMutation({
    mutationFn: (itemId: string) => api.rewards.redeem({ itemId }),
    onSuccess: (redemption) => {
      void queryClient.invalidateQueries({ queryKey: ["rewardsMe"] });
      setRedeemModalItem(null);
      setFeedback({
        type: "success",
        text: `Redemption confirmed! Request ID: ${redemption.id}. Campus support will review and fulfil it.`,
      });
    },
    onError: (err: Error) => {
      setFeedback({
        type: "error",
        text: err.message || "Failed to redeem item. Please try again.",
      });
    },
  });

  if (isLoading) {
    return <LoadingSkeleton lines={6} label="Loading your rewards and LearnCoins balance..." />;
  }

  if (error) {
    return (
      <PanelErrorState
        error={error}
        onRetry={() => void refetch()}
        panelName="My Rewards"
      />
    );
  }

  const balance = data?.balance ?? 0;
  const ledger = data?.ledger ?? [];
  const catalog = data?.catalog ?? [];
  const progress = data?.progress;

  const getSourceTypeBadge = (sourceType: string) => {
    switch (sourceType) {
      case "COMEBACK":
        return {
          label: "Attendance Comeback",
          className: "bg-emerald-100 text-emerald-800 border-emerald-300",
        };
      case "CONSISTENCY":
        return {
          label: "Weekly Consistency",
          className: "bg-sky-100 text-sky-800 border-sky-300",
        };
      case "SUPPORT_SESSION":
        return {
          label: "Peer Tutoring Learner",
          className: "bg-teal-100 text-teal-800 border-teal-300",
        };
      case "SUPPORT_SESSION_TUTOR":
        return {
          label: "Peer Tutor Credit",
          className: "bg-indigo-100 text-indigo-800 border-indigo-300",
        };
      default:
        return {
          label: sourceType,
          className: "bg-slate-100 text-slate-800 border-slate-300",
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">My Rewards (LearnCoins)</h1>
          <p className="text-xs text-slate-600 mt-1">
            Celebrate your learning progress, attendance consistency, and peer support with LearnCoins.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-xs font-semibold text-blue-800">
            Private & Confidential to You
          </span>
        </div>
      </div>

      {/* Feedback Toast Banner */}
      {feedback && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between gap-3 text-xs ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-300 text-emerald-900"
              : "bg-rose-50 border-rose-300 text-rose-900"
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs font-semibold underline hover:opacity-80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Balance & Progress Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Balance Card */}
        <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white p-6 rounded-xl shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-200">
              Available Balance
            </span>
            <span className="px-2 py-0.5 rounded bg-blue-600/60 border border-blue-400/40 text-[11px] font-medium text-blue-100">
              LearnCoins
            </span>
          </div>
          <div>
            <div className="text-4xl font-extrabold tracking-tight">
              {balance}
            </div>
            <p className="text-xs text-blue-100/90 mt-1">
              Your points are private. LearnTrack does not have public leaderboards or rankings.
            </p>
          </div>
        </div>

        {/* Next Reward Progress Card */}
        <div className="md:col-span-2 bg-white p-6 rounded-xl border border-slate-200 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Progress Towards Next Reward
              </span>
              {progress?.nextRewardCost && (
                <span className="text-xs font-semibold text-blue-700">
                  {progress.percent}% Unlocked
                </span>
              )}
            </div>

            {progress?.nextRewardName ? (
              <div className="space-y-2 mt-2">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="font-semibold text-slate-900">
                    {progress.nextRewardName}
                  </span>
                  <span className="text-xs font-medium text-slate-500">
                    Goal: {progress.nextRewardCost} LearnCoins
                  </span>
                </div>

                {/* Progress bar container */}
                <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${progress.percent}%` }}
                    role="progressbar"
                    aria-valuenow={progress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>

                <p className="text-xs text-slate-600">
                  {progress.pointsNeeded > 0
                    ? `You are ${progress.pointsNeeded} LearnCoins away from unlocking this reward.`
                    : "You have reached enough LearnCoins to redeem this reward!"}
                </p>
              </div>
            ) : (
              <div className="mt-2 text-xs text-slate-600 space-y-1">
                <p className="font-semibold text-emerald-700">
                  Awesome work! You have enough points to unlock any reward in the catalog.
                </p>
                <p>Choose your preferred reward below whenever you wish to redeem.</p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Points are awarded server-side weekly based on verifiable engagement.</span>
            <span className="font-medium text-slate-600">No marks or test scores rewarded</span>
          </div>
        </div>
      </div>

      {/* Catalog Section */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Rewards Catalog</h2>
            <p className="text-xs text-slate-600">
              Redeem your LearnCoins for campus resources, development opportunities, and prize draws.
            </p>
          </div>
          <span className="text-xs text-slate-500">
            {catalog.length} item{catalog.length === 1 ? "" : "s"} available
          </span>
        </div>

        {catalog.length === 0 ? (
          <EmptyState
            title="No catalog items available"
            description="The campus rewards catalog is being refreshed. Please check back soon!"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {catalog.map((item) => {
              const isEntered = Boolean(item.isDraw && item.entered);
              const isOutOfStock = item.stock <= 0;
              const isInsufficientBalance = balance < item.cost;
              const canRedeem = !isEntered && !isOutOfStock && !isInsufficientBalance;

              let disabledReason: string | null = null;
              if (isEntered) {
                disabledReason = "Already entered in this draw";
              } else if (isOutOfStock) {
                disabledReason = "Currently out of stock";
              } else if (isInsufficientBalance) {
                disabledReason = `Need ${item.cost - balance} more LearnCoins`;
              }

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col justify-between space-y-4 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {item.simulated && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          SIMULATED
                        </span>
                      )}
                      {item.isDraw && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300">
                          LUCKY DRAW
                        </span>
                      )}
                      {isEntered && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          ENTERED
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-bold text-slate-900">
                      {item.name}
                    </h3>
                    <p className="text-xs text-slate-600 line-clamp-3">
                      {item.description}
                    </p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-slate-100">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Cost</span>
                        <strong className="text-sm font-extrabold text-blue-700">
                          {item.cost} LearnCoins
                        </strong>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-500 block text-[11px]">Stock</span>
                        <span className={item.stock > 0 ? "font-semibold text-slate-700" : "font-semibold text-rose-600"}>
                          {item.stock > 0 ? `${item.stock} left` : "Out of stock"}
                        </span>
                      </div>
                    </div>

                    {disabledReason && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 px-2.5 py-1 rounded border border-amber-200">
                        {disabledReason}
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={!canRedeem}
                      onClick={() => setRedeemModalItem(item)}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                        canRedeem
                          ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
                          : "bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed"
                      }`}
                    >
                      {isEntered
                        ? "Entered in Draw"
                        : item.isDraw
                        ? "Enter Lucky Draw"
                        : "Redeem Item"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* "How You Earned It" Ledger History */}
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">How You Earned It</h2>
          <p className="text-xs text-slate-600">
            A chronological record of LearnCoins earned through attendance comebacks, consistency, and peer tutoring.
          </p>
        </div>

        {ledger.length === 0 ? (
          <EmptyState
            title="No reward entries recorded yet"
            description="As your attendance consistency improves or as you complete peer tutoring sessions, awarded LearnCoins will appear here."
          />
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Date
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Category
                    </th>
                    <th scope="col" className="px-4 py-3 text-left font-semibold text-slate-700">
                      Reason
                    </th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold text-slate-700">
                      Points
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 bg-white">
                  {ledger.map((entry) => {
                    const badge = getSourceTypeBadge(entry.sourceType);
                    return (
                      <tr key={entry.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600 font-medium">
                          {formatLocalDate(entry.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-800">
                          {entry.reason}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right font-bold text-emerald-600 text-sm">
                          +{entry.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {redeemModalItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="redeem-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
        >
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-xl space-y-4">
            <div className="space-y-1">
              <h3 id="redeem-dialog-title" className="text-base font-bold text-slate-900">
                {redeemModalItem.isDraw ? "Confirm Lucky Draw Entry" : "Confirm Reward Redemption"}
              </h3>
              <p className="text-xs text-slate-600">
                Please review your redemption details before confirming.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Reward:</span>
                <span className="font-bold text-slate-900 text-right">{redeemModalItem.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Cost:</span>
                <span className="font-bold text-blue-700">{redeemModalItem.cost} LearnCoins</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Balance:</span>
                <span className="font-semibold text-slate-800">{balance} LearnCoins</span>
              </div>
              <div className="border-t border-slate-200 pt-2 flex justify-between font-bold">
                <span className="text-slate-700">Remaining Balance:</span>
                <span className="text-slate-900">{balance - redeemModalItem.cost} LearnCoins</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Redemptions are verified server-side. Campus support will fulfil your item or draw entry.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setRedeemModalItem(null)}
                disabled={redeemMutation.isPending}
                className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => redeemMutation.mutate(redeemModalItem.id)}
                disabled={redeemMutation.isPending}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {redeemMutation.isPending ? "Confirming..." : "Confirm Redemption"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
