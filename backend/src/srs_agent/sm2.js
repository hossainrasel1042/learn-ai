


function clampEase(ef) {
  return ef < 1.3 ? 1.3 : ef;
}


export function scheduleCard(card, rating) {
  const r = Number(rating);
  let easeFactor = card.easeFactor ?? 2.5;
  let intervalDays = card.intervalDays ?? 0;
  let repetitions = card.repetitions ?? 0;



  let q;
  if (r === 0) q = 1;
  else if (r === 2) q = 3;
  else if (r === 3) q = 4;
  else if (r === 4) q = 5;
  else throw new Error(`Invalid rating: ${rating}. Must be 0, 2, 3, or 4.`);


  if (q < 3) {
    repetitions = 0;
    intervalDays = 1;

    easeFactor = clampEase(easeFactor - 0.2);
  } else {

    if (repetitions === 0) {
      intervalDays = 1;
    } else if (repetitions === 1) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
    repetitions += 1;


    easeFactor = clampEase(
      easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
    );
  }


  const dueAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);

  return {
    easeFactor: Number(easeFactor.toFixed(4)),
    intervalDays,
    repetitions,
    dueAt,
  };
}


export function previewIntervals(card) {
  return {
    again: scheduleCard(card, 0).intervalDays,
    hard: scheduleCard(card, 2).intervalDays,
    good: scheduleCard(card, 3).intervalDays,
    easy: scheduleCard(card, 4).intervalDays,
  };
}


export function formatInterval(days) {
  const d = Math.max(0, Math.round(days));
  if (d === 0) return '<1d';
  if (d === 1) return '1d';
  if (d < 30) return `${d}d`;
  if (d < 365) {
    const months = Math.round(d / 30);
    return `${months}mo`;
  }
  const years = (d / 365).toFixed(1).replace(/\.0$/, '');
  return `${years}y`;
}
