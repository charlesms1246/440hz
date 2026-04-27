# Reference Dockerfile for a 440hz Gym.
#
# Pattern any Gym should follow:
#   1. Start from a slim base.
#   2. Install gym-sdk + your gym's deps.
#   3. Copy your gym module.
#   4. ENTRYPOINT runs the module — `serve()` binds to $GYM_PORT (default 8080).
#
# The 440hz no-code UI generates this file plus the gym module from the user's
# drag-and-drop spec. For hand-rolled gyms, copy this verbatim and edit the
# COPY line.

FROM python:3.11-slim

WORKDIR /app

# gym_sdk is usually pip-installed once we publish it; for now we vendor it in
# alongside the gym module via the build context.
COPY gym_sdk/ /app/gym_sdk/
COPY gym_sdk/requirements.txt /tmp/gym-sdk-requirements.txt
RUN pip install --no-cache-dir -r /tmp/gym-sdk-requirements.txt

# Gym-specific deps (none for the SQL example, but real gyms put their
# requirements.txt here).
# COPY examples/sample-gym/requirements.txt /tmp/gym-requirements.txt
# RUN pip install --no-cache-dir -r /tmp/gym-requirements.txt

# The gym module itself.
COPY examples/sample-gym/sql_gym.py /app/sql_gym.py

ENV GYM_PORT=8080
EXPOSE 8080

ENTRYPOINT ["python", "/app/sql_gym.py"]
