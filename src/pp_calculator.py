"""
Калькулятор PP на основе официальной формулы osu!
"""

from typing import Dict

from src.models import BeatmapAttributes


class OsuPPCalculator:
    """Калькулятор PP на основе официальной формулы osu!"""
    
    @staticmethod
    def calculate_accuracy(num300: int, num100: int, num50: int, 
                          num_miss: int) -> float:
        """Рассчитывает точность"""
        total_hits = num300 + num100 + num50 + num_miss
        if total_hits == 0:
            return 0.0
            
        return max(0.0, min(1.0,
            (num50 * 50 + num100 * 100 + num300 * 300) / (total_hits * 300)
        ))
    
    @staticmethod
    def compute_effective_miss_count(num_miss: int, max_combo: int,
                                   beatmap_max_combo: float, 
                                   num_sliders: int) -> float:
        """Вычисляет эффективное количество пропусков"""
        combo_based_miss_count = 0.0
        
        if num_sliders > 0:
            full_combo_threshold = beatmap_max_combo - 0.1 * num_sliders
            if max_combo < full_combo_threshold:
                combo_based_miss_count = full_combo_threshold / max(1, max_combo)
        
        combo_based_miss_count = min(combo_based_miss_count, 
                                    float(num_miss))
        
        return max(float(num_miss), combo_based_miss_count)
    
    @staticmethod
    def calculate_total_pp(beatmap: BeatmapAttributes, mods: int,
                          max_combo: int, num300: int, num100: int,
                          num50: int, num_miss: int) -> Dict[str, float]:
        """Основная функция расчета PP"""
        
        # Неранкнутые моды
        if (mods & (1 << 7) or  # Relax
            mods & (1 << 9) or  # Relax2
            mods & (1 << 11)):  # Autoplay
            return {"total": 0.0, "aim": 0.0, "speed": 0.0, 
                   "accuracy": 0.0, "flashlight": 0.0}
        
        # Эффективное количество пропусков
        effective_miss_count = OsuPPCalculator.compute_effective_miss_count(
            num_miss, max_combo, beatmap.max_combo, beatmap.num_sliders
        )
        
        # Рассчитываем компоненты PP
        aim = OsuPPCalculator._compute_aim_value(
            beatmap, mods, max_combo, num300, num100, 
            num50, num_miss, effective_miss_count
        )
        speed = OsuPPCalculator._compute_speed_value(
            beatmap, mods, max_combo, num300, num100,
            num50, num_miss, effective_miss_count
        )
        accuracy = OsuPPCalculator._compute_accuracy_value(
            beatmap, mods, num300, num100, num50, num_miss
        )
        flashlight = OsuPPCalculator._compute_flashlight_value(
            beatmap, mods, max_combo, num300, num100, 
            num50, num_miss, effective_miss_count
        )
        
        # Общий множитель
        multiplier = 1.14
        
        # Штраф NoFail
        if mods & (1 << 0):  # NoFail
            multiplier *= max(0.9, 1.0 - 0.02 * effective_miss_count)
        
        # Штраф SpunOut
        total_hits = num300 + num100 + num50 + num_miss
        if mods & (1 << 12) and beatmap.num_spinners > 0:  # SpunOut
            multiplier *= 1.0 - pow(beatmap.num_spinners / total_hits, 0.85)
        
        # Итоговый PP
        total = pow(
            pow(aim, 1.1) + pow(speed, 1.1) + 
            pow(accuracy, 1.1) + pow(flashlight, 1.1),
            1.0 / 1.1
        ) * multiplier
        
        return {
            "total": round(total, 2),
            "aim": round(aim, 2),
            "speed": round(speed, 2),
            "accuracy": round(accuracy, 2),
            "flashlight": round(flashlight, 2)
        }
    
    @staticmethod
    def _compute_aim_value(beatmap: BeatmapAttributes, mods: int,
                          max_combo: int, num300: int, num100: int,
                          num50: int, num_miss: int, 
                          effective_miss_count: float) -> float:
        """Рассчитывает Aim PP"""
        # Упрощенная реализация для примера
        aim_value = beatmap.aim * 10
        
        total_hits = num300 + num100 + num50 + num_miss
        
        # Масштабирование по комбо
        if beatmap.max_combo > 0:
            combo_factor = min(pow(max_combo, 0.8) / 
                              pow(beatmap.max_combo, 0.8), 1.0)
            aim_value *= combo_factor
        
        # Точность
        accuracy = OsuPPCalculator.calculate_accuracy(
            num300, num100, num50, num_miss
        )
        aim_value *= accuracy
        
        # Влияние модов
        if mods & 8:  # Hidden
            aim_value *= 1.07
        
        return max(aim_value, 0.0)
    
    @staticmethod
    def _compute_speed_value(beatmap: BeatmapAttributes, mods: int,
                            max_combo: int, num300: int, num100: int,
                            num50: int, num_miss: int,
                            effective_miss_count: float) -> float:
        """Рассчитывает Speed PP"""
        # Упрощенная реализация
        speed_value = beatmap.speed * 8
        
        total_hits = num300 + num100 + num50 + num_miss
        
        # Влияние точности
        accuracy = OsuPPCalculator.calculate_accuracy(
            num300, num100, num50, num_miss
        )
        speed_value *= (0.95 + accuracy * 0.1)
        
        # Штраф за 50
        if num50 > total_hits * 0.1:
            speed_value *= 0.97
        
        return max(speed_value, 0.0)
    
    @staticmethod
    def _compute_accuracy_value(beatmap: BeatmapAttributes, mods: int,
                               num300: int, num100: int, 
                               num50: int, num_miss: int) -> float:
        """Рассчитывает Accuracy PP"""
        accuracy = OsuPPCalculator.calculate_accuracy(
            num300, num100, num50, num_miss
        )
        
        accuracy_value = pow(accuracy, 4) * 20
        
        # Влияние OD
        accuracy_value *= 0.98 + pow(beatmap.od, 2) / 2500
        
        # Моды
        if mods & 8:  # Hidden
            accuracy_value *= 1.08
        
        return max(accuracy_value, 0.0)
    
    @staticmethod
    def _compute_flashlight_value(beatmap: BeatmapAttributes, mods: int,
                                 max_combo: int, num300: int, num100: int,
                                 num50: int, num_miss: int,
                                 effective_miss_count: float) -> float:
        """Рассчитывает Flashlight PP"""
        if not (mods & 1024):  # Нет фонарика
            return 0.0
        
        flashlight_value = pow(beatmap.flashlight, 1.5) * 15
        
        # Влияние точности
        accuracy = OsuPPCalculator.calculate_accuracy(
            num300, num100, num50, num_miss
        )
        flashlight_value *= 0.5 + accuracy / 2.0
        
        return max(flashlight_value, 0.0)
