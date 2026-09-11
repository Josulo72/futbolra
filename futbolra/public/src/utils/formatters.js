const formatters = {
  formatDate(date, locale = 'es-ES') {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  },

  formatTime(date, locale = 'es-ES') {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString(locale, {
      hour: '2-digit',
      minute: '2-digit'
    });
  },

  formatDateTime(date, locale = 'es-ES') {
    if (!date) return '';
    return `${this.formatDate(date, locale)} a las ${this.formatTime(date, locale)}`;
  },

  formatScore(score1, score2) {
    if (score1 === null || score2 === null) return 'vs';
    return `${score1} - ${score2}`;
  },

  formatRelativeTime(date) {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diff = d - now;

    if (diff <= 0) return 'En juego';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `En ${days}d ${hours}h`;
    if (hours > 0) return `En ${hours}h ${minutes}m`;
    return `En ${minutes}m`;
  },

  formatMatchStatus(status) {
    const statusMap = {
      scheduled: 'Programado',
      live: 'En vivo',
      finished: 'Finalizado',
      postponed: 'Aplazado',
      cancelled: 'Cancelado'
    };
    return statusMap[status] || status;
  },

  formatJourneyStatus(status) {
    const statusMap = {
      open: 'Abierto para predicciones',
      locked: 'Bloqueado - Jornada iniciada',
      live: 'En juego',
      finished: 'Finalizada',
      empty: 'Sin partidos',
      'no-dates': 'Sin fechas'
    };
    return statusMap[status] || status;
  },

  formatParticipantStatus(participant) {
    if (!participant.active) {
      return `Eliminado en partido ${participant.eliminatedInMatch ? '🗑️' : ''}`;
    }
    return 'Activo 🟢';
  },

  truncate(str, maxLength = 30) {
    if (!str || str.length <= maxLength) return str;
    return str.slice(0, maxLength - 1) + '…';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = formatters;
}