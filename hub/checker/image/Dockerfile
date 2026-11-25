FROM eclipse-temurin:17.0.16_8-jdk-noble@sha256:bbc959486c469c589091571ba524e6a98f27e19bd99489c683d9b465e4f8db8d
RUN rm -f /etc/apt/sources.list.d/* && printf "deb https://snapshot.ubuntu.com/ubuntu/20251002T000000Z noble main universe\ndeb https://snapshot.ubuntu.com/ubuntu/20251002T000000Z noble-updates main universe\ndeb https://snapshot.ubuntu.com/ubuntu/20251002T000000Z noble-security main universe\n" >/etc/apt/sources.list && apt-get update && apt-get install -y --no-install-recommends python3 xvfb xauth libgtk-3-0t64 libasound2t64 libxtst6 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
ARG POLICY_DIGEST
LABEL zero.policy="zero-libraries-v1" zero.policy-source=$POLICY_DIGEST
COPY javafx/ /opt/javafx/
COPY Boundary.java JarTracker.java TrustedRun.java FixedSmoke.java module-info.java work.py /policy/
RUN mkdir /policy/classes /opt/javafx/native && cd /opt/javafx/native && for f in /opt/javafx/*.jar; do jar xf "$f"; done && find . -type f ! -name '*.so' -delete && javac -proc:none --release 17 --module-path /opt/javafx --add-modules javafx.controls,javafx.swing -d /policy/classes /policy/*.java && printf 'Premain-Class: hub.policy.JarTracker\n\n' >/policy/agent.mf && jar cfm /policy/checker.jar /policy/agent.mf -C /policy/classes . && timeout 15s xvfb-run --auto-servernum --server-args="-screen 0 1024x768x24 -nolisten tcp" java -Djavafx.cachedir=/opt/javafx/native -Dprism.order=sw --module-path /opt/javafx:/policy/checker.jar --module zero.hub.checker/hub.smoke.FixedSmoke && chmod -R a-w /policy /opt/javafx
COPY core-source/ /tmp/zero-core-source/
RUN mkdir -p /opt/zero /tmp/zero-core-classes && \
    find /tmp/zero-core-source -type f -name '*.java' | LC_ALL=C sort >/tmp/zero-core-sources && \
    javac -proc:none --release 17 --module-path /opt/javafx --add-modules javafx.controls,javafx.media \
      -encoding UTF-8 -d /tmp/zero-core-classes @/tmp/zero-core-sources && \
    jar --create --date=2020-01-01T00:00:00Z --file /opt/zero/zero-core.jar -C /tmp/zero-core-classes . && \
    chmod -R a-w /opt/zero && rm -rf /tmp/zero-core-source /tmp/zero-core-classes /tmp/zero-core-sources
USER 10001:10001
WORKDIR /tmp
