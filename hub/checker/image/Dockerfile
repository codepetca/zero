FROM eclipse-temurin:17.0.16_8-jdk-noble@sha256:bbc959486c469c589091571ba524e6a98f27e19bd99489c683d9b465e4f8db8d
RUN rm -f /etc/apt/sources.list.d/* && printf "deb https://snapshot.ubuntu.com/ubuntu/20251002T000000Z noble main universe\ndeb https://snapshot.ubuntu.com/ubuntu/20251002T000000Z noble-updates main universe\ndeb https://snapshot.ubuntu.com/ubuntu/20251002T000000Z noble-security main universe\n" >/etc/apt/sources.list && apt-get update && apt-get install -y --no-install-recommends python3 xvfb xauth libgtk-3-0t64 libasound2t64 libxtst6 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ARG POLICY_DIGEST
LABEL zero.policy="zero-widgets-v1" zero.policy-source=$POLICY_DIGEST
COPY javafx/ /opt/javafx/
COPY Boundary.java JarTracker.java TrustedRun.java FixedSmoke.java work.py /policy/
RUN mkdir /policy/classes /opt/javafx/native && cd /opt/javafx/native && for f in /opt/javafx/*.jar; do jar xf "$f"; done && find . -type f ! -name '*.so' -delete && javac -proc:none --release 17 --module-path /opt/javafx --add-modules javafx.controls,javafx.swing -d /policy/classes /policy/*.java && printf 'Premain-Class: hub.policy.JarTracker\n\n' >/policy/agent.mf && jar cfm /policy/tracker.jar /policy/agent.mf -C /policy/classes hub/policy/JarTracker.class -C /policy/classes 'hub/policy/JarTracker$1.class' && timeout 15s xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24 -nolisten tcp" java -Djavafx.cachedir=/opt/javafx/native -Dprism.order=sw --module-path /opt/javafx --add-modules javafx.controls,javafx.swing -cp /policy/classes hub.policy.FixedSmoke && chmod -R a-w /policy /opt/javafx
USER 10001:10001
WORKDIR /tmp
