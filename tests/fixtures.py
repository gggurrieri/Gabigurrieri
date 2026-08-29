#!/usr/bin/env python3
"""Genera los archivos de prueba que consumen las pruebas de extremo a extremo.

Uso: python3 tests/fixtures.py <directorio>
"""
import sys, pathlib, zipfile, datetime, json

def salida():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    d = pathlib.Path(sys.argv[1]); (d / 'zepp').mkdir(parents=True, exist_ok=True)
    return d

HOY = datetime.date(2026, 8, 29)
def ts(d, h=18, m=0): return f'{d.isoformat()} {h:02d}:{m:02d}:00 -0300'

def workout(d, tipo='Cycling', minutos=42, km=14.2, kcal=430, fc=(131, 162)):
    est = f'  <WorkoutStatistics type="HKQuantityTypeIdentifierDistanceCycling" sum="{km}" unit="km"/>\n' if km else ''
    est += f'  <WorkoutStatistics type="HKQuantityTypeIdentifierActiveEnergyBurned" sum="{kcal}" unit="kcal"/>\n'
    if fc:
        est += f'  <WorkoutStatistics type="HKQuantityTypeIdentifierHeartRate" average="{fc[0]}" maximum="{fc[1]}" unit="count/min"/>\n'
    return (f'<Workout workoutActivityType="HKWorkoutActivityType{tipo}" duration="{minutos}" durationUnit="min" '
            f'sourceName="Zepp" creationDate="{ts(d)}" startDate="{ts(d)}" endDate="{ts(d, 19)}">\n{est}</Workout>\n')

def peso(d, kg, unidad='kg'):
    return (f'<Record type="HKQuantityTypeIdentifierBodyMass" sourceName="Balanza" unit="{unidad}" '
            f'creationDate="{ts(d, 7)}" startDate="{ts(d, 7)}" endDate="{ts(d, 7)}" value="{kg}"/>\n')

def ruido(d, n=300):
    return ''.join(
        f'<Record type="HKQuantityTypeIdentifierHeartRate" sourceName="Amazfit" unit="count/min" '
        f'creationDate="{ts(d, 9, i % 60)}" startDate="{ts(d, 9, i % 60)}" endDate="{ts(d, 9, i % 60)}" value="{60 + i % 50}"/>\n'
        for i in range(n))

def envolver(cuerpo):
    return ('<?xml version="1.0" encoding="UTF-8"?>\n<HealthData locale="es_AR">\n'
            '<ExportDate value="2026-08-29 12:00:00 -0300"/>\n' + cuerpo + '</HealthData>\n')

def zipear(ruta, nombre_xml, xml, extras=()):
    with zipfile.ZipFile(ruta, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr(f'apple_health_export/{nombre_xml}', xml)
        for n, c in extras:
            z.writestr(f'apple_health_export/{n}', c)

def main():
    d = salida()
    inicio = datetime.date(2026, 8, 10)
    cuerpo, pesos = [], 0
    for i in range(12):                                   # anteriores al desafío
        cuerpo.append(ruido(inicio - datetime.timedelta(days=40 - i), 200))
        cuerpo.append(workout(inicio - datetime.timedelta(days=40 - i), 'Walking', 35, 3.2, 180, None))
    for i in range(20):                                   # dentro del desafío
        f = inicio + datetime.timedelta(days=i)
        cuerpo.append(ruido(f, 200))
        if i % 3 == 0:
            cuerpo.append(peso(f, round(91 - i * 0.12, 1))); pesos += 1
        cuerpo.append(workout(f) if i % 2 == 0 else workout(f, 'JumpRope', 22, 0, 248, (144, 171)))
    f = inicio + datetime.timedelta(days=13)
    cuerpo.append(peso(f, 196.2, 'lb')); pesos += 1
    cuerpo.append(workout(f, 'Soccer', 90, 6.9, 710, None))
    xml = envolver(''.join(cuerpo))

    cda = '<?xml version="1.0"?>\n<ClinicalDocument>' + '<x/>' * 2000 + '</ClinicalDocument>'
    zipear(d / 'exportacion-es.zip', 'exportación.xml', xml, [('exportacion_cda.xml', cda)])
    zipear(d / 'export-en.zip', 'export.xml', xml, [('export_cda.xml', cda)])
    zipear(d / 'export-sin-entrenos.zip', 'exportación.xml',
           envolver(''.join(x for x in cuerpo if '<Workout' not in x)))
    zipear(d / 'solo-cda.zip', 'exportacion_cda.xml', cda)
    with zipfile.ZipFile(d / 'fotos.zip', 'w') as z:
        z.writestr('IMG_0431.HEIC', 'x')

    # primer uso: fecha de inicio en hoy y el historial hacia atrás
    caso = ''.join(workout(HOY - datetime.timedelta(days=n)) for n in (150, 120, 60, 45, 20))
    zipear(d / 'caso-usuario.zip', 'exportación.xml', envolver(caso))

    # actividad suelta del reloj, en TCX con la serie de pulso
    s2 = datetime.datetime(2026, 8, 31, 19, 0, 0)
    tp = ''.join(
        f'<Trackpoint><Time>{(s2 + datetime.timedelta(seconds=10 * i)).strftime("%Y-%m-%dT%H:%M:%SZ")}</Time>'
        f'<HeartRateBpm><Value>{150 if (i // 6) % 2 == 0 else 122}</Value></HeartRateBpm></Trackpoint>'
        for i in range(145))
    (d / 'zepp' / 'soga-otro-dia.tcx').write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">\n'
        f' <Activities><Activity Sport="JumpRope"><Id>{s2.strftime("%Y-%m-%dT%H:%M:%SZ")}</Id>\n'
        f'  <Lap StartTime="{s2.strftime("%Y-%m-%dT%H:%M:%SZ")}"><TotalTimeSeconds>1440</TotalTimeSeconds>'
        '<DistanceMeters>0</DistanceMeters><Calories>260</Calories>'
        '<AverageHeartRateBpm><Value>136</Value></AverageHeartRateBpm>'
        '<MaximumHeartRateBpm><Value>158</Value></MaximumHeartRateBpm>'
        f'<Track>{tp}</Track></Lap>\n </Activity></Activities>\n</TrainingCenterDatabase>\n',
        encoding='utf-8')
    # dos fuentes contando los mismos pasos: el caso que hay que desduplicar
    pasos, esperado = [], {}
    for i in range(20):
        f = inicio + datetime.timedelta(days=i)
        reales, parcial = 6000 + i * 180, int((6000 + i * 180) * 0.62)
        for n in range(12):
            pasos.append(f'<Record type="HKQuantityTypeIdentifierStepCount" sourceName="Amazfit" unit="count" '
                         f'creationDate="{ts(f, 9, n)}" startDate="{ts(f, 9, n)}" endDate="{ts(f, 9, n)}" value="{reales // 12}"/>\n')
            pasos.append(f'<Record type="HKQuantityTypeIdentifierStepCount" sourceName="iPhone" unit="count" '
                         f'creationDate="{ts(f, 10, n)}" startDate="{ts(f, 10, n)}" endDate="{ts(f, 10, n)}" value="{parcial // 12}"/>\n')
        esperado[f.isoformat()] = (reales // 12) * 12
        fc = 62 - i // 4
        for fuente, v in (('Amazfit', fc), ('iPhone', fc + 1)):
            pasos.append(f'<Record type="HKQuantityTypeIdentifierRestingHeartRate" sourceName="{fuente}" '
                         f'unit="count/min" creationDate="{ts(f, 7)}" startDate="{ts(f, 7)}" endDate="{ts(f, 7)}" value="{v}"/>\n')
    pasos.append(workout(inicio, 'Cycling', 45, 14.0, 430, None))
    zipear(d / 'pasos.zip', 'exportación.xml', envolver(''.join(pasos)))
    (d / 'pasos-esperado.json').write_text(json.dumps(esperado), encoding='utf-8')

    print(f'archivos de prueba en {d} · {pesos} pesos, 33 entrenamientos, 20 días de pasos')

if __name__ == '__main__':
    main()
