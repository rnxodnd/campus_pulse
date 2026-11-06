import { useEffect, useRef, useState } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import plainBear1 from '../../assets/bears/plain-1.png';
import plainBear2 from '../../assets/bears/plain-2.png';
import trayBear1 from '../../assets/bears/tray-1.png';
import trayBear2 from '../../assets/bears/tray-2.png';
import chefBear1 from '../../assets/bears/chef-1.png';
import chefBear2 from '../../assets/bears/chef-2.png';
import drinkBear1 from '../../assets/bears/drink-1.png';
import drinkBear2 from '../../assets/bears/drink-2.png';
import musicBear1 from '../../assets/bears/music-1.png';
import musicBear2 from '../../assets/bears/music-2.png';
import bookBear1 from '../../assets/bears/book-1.png';
import bookBear2 from '../../assets/bears/book-2.png';

const BEAR_FRAMES = [
  [plainBear1, plainBear2],
  [trayBear1, trayBear2],
  [chefBear1, chefBear2],
  [drinkBear1, drinkBear2],
  [musicBear1, musicBear2],
  [bookBear1, bookBear2],
];

const BEAR_COUNT_BY_LEVEL = { LOW: 3, MEDIUM: 7, HIGH: 13 };
const CROWD_LABEL = { LOW: '여유', MEDIUM: '보통', HIGH: '혼잡' };
const BEAR_WIDTH = 52;
const BEAR_HEIGHT = 68;

export default function BearCrowdScene({ crowdLevel }) {
  const [sceneSize, setSceneSize] = useState({ width: 0, height: 0 });
  const bearCount = BEAR_COUNT_BY_LEVEL[crowdLevel] ?? 0;

  function updateSceneSize(event) {
    const { width, height } = event.nativeEvent.layout;
    setSceneSize((current) => current.width === width && current.height === height ? current : { width, height });
  }

  const bears = bearCount > 0 && sceneSize.width > 0
    ? Array.from({ length: bearCount }, (_, index) => {
      const columns = bearCount <= 3 ? 3 : bearCount <= 7 ? 4 : 5;
      const rows = Math.ceil(bearCount / columns);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const slotWidth = sceneSize.width / columns;
      const left = Math.min(sceneSize.width - BEAR_WIDTH, Math.max(0, (column + 0.5) * slotWidth - BEAR_WIDTH / 2 + (row % 2 ? slotWidth * 0.28 : 0)));
      const yBands = rows === 1 ? [0.70] : rows === 2 ? [0.56, 0.78] : [0.43, 0.62, 0.81];
      const top = Math.min(sceneSize.height - BEAR_HEIGHT, Math.max(0, sceneSize.height * yBands[row] - BEAR_HEIGHT));
      return (
        <WalkingBear
          key={`${crowdLevel}-${index}`}
          frames={BEAR_FRAMES[index % BEAR_FRAMES.length]}
          left={left}
          top={top}
          wanderX={Math.min(28, Math.max(14, slotWidth * 0.38))}
          wanderY={22 + (index % 3) * 5}
          index={index}
          zIndex={row + 1}
        />
      );
    })
    : null;

  return (
    <View
      pointerEvents="none"
      accessibilityLabel={crowdLevel ? `${CROWD_LABEL[crowdLevel]} 상태 곰두리 애니메이션` : '혼잡도 분석 결과 대기 중'}
      style={styles.scene}
      onLayout={updateSceneSize}
    >
      {bears}
      {crowdLevel && bearCount === 0 ? <Image source={plainBear1} style={styles.fallbackBear} resizeMode="contain" /> : null}
    </View>
  );
}

function WalkingBear({ frames, left, top, wanderX, wanderY, index, zIndex }) {
  const [motion] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const [framePhase] = useState(() => new Animated.Value(0));
  const [facing, setFacing] = useState(index % 2 === 0 ? 1 : -1);
  const previousOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let active = true;
    let timer;
    const walkFrames = Animated.loop(
      Animated.sequence([
        Animated.timing(framePhase, { toValue: 1, duration: 180, useNativeDriver: true, isInteraction: false }),
        Animated.timing(framePhase, { toValue: 0, duration: 180, useNativeDriver: true, isInteraction: false }),
      ]),
    );
    walkFrames.start();

    function wander() {
      if (!active) return;
      const offset = {
        x: (Math.random() * 2 - 1) * wanderX,
        y: (Math.random() * 2 - 1) * wanderY,
      };
      setFacing(offset.x < previousOffset.current.x ? -1 : 1);
      previousOffset.current = offset;
      Animated.parallel([
        Animated.timing(motion.x, { toValue: offset.x, duration: 1500 + Math.random() * 900, useNativeDriver: true, isInteraction: false }),
        Animated.timing(motion.y, { toValue: offset.y, duration: 1500 + Math.random() * 900, useNativeDriver: true, isInteraction: false }),
      ]).start(({ finished }) => {
        if (finished && active) timer = setTimeout(wander, 350 + Math.random() * 800);
      });
    }

    timer = setTimeout(wander, 150 + index * 70);
    return () => {
      active = false;
      clearTimeout(timer);
      motion.stopAnimation();
      walkFrames.stop();
    };
  }, [framePhase, index, motion, wanderX, wanderY]);

  const bob = framePhase.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -4, 0] });
  const firstOpacity = framePhase.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: [1, 1, 0, 0] });
  const secondOpacity = framePhase.interpolate({ inputRange: [0, 0.45, 0.55, 1], outputRange: [0, 0, 1, 1] });

  return (
    <Animated.View style={[styles.bear, { left, top, zIndex }, { transform: [
      { translateX: motion.x },
      { translateY: Animated.add(motion.y, bob) },
      { scaleX: facing },
    ] }]}>
      <Animated.Image source={frames[0]} resizeMode="contain" style={[styles.bearImage, { opacity: firstOpacity }]} />
      <Animated.Image source={frames[1]} resizeMode="contain" style={[styles.bearImage, styles.secondFrame, { opacity: secondOpacity }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scene: {
    position: 'absolute',
    top: 144,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  bear: {
    position: 'absolute',
    width: BEAR_WIDTH,
    height: BEAR_HEIGHT,
  },
  bearImage: {
    position: 'absolute',
    width: BEAR_WIDTH,
    height: BEAR_HEIGHT,
  },
  secondFrame: { left: 0, top: 0 },
  fallbackBear: {
    position: 'absolute',
    width: BEAR_WIDTH,
    height: BEAR_HEIGHT,
    left: '45%',
    bottom: 30,
  },
});
